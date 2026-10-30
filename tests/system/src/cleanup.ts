import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

import { deleteEmailsTo } from './api.ts';
import { POSTGRES, required, STORAGE, TEST_CATEGORY_PREFIX, TEST_EMAIL_DOMAIN } from './env.ts';

export interface CleanupResult {
  users: number;
  occurrences: number;
  categories: number;
  photos: number;
  emails: number;
}

async function withDatabase<T>(database: string, fn: (db: pg.Client) => Promise<T>): Promise<T> {
  // The superuser from `.env`: the checks clean up across the three service databases.
  const db = new pg.Client({
    ...POSTGRES,
    database,
    user: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
  });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

async function deletePhotos(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const s3 = new S3Client({
    endpoint: STORAGE.endpoint,
    region: STORAGE.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: required('S3_ACCESS_KEY'),
      secretAccessKey: required('S3_SECRET_KEY'),
    },
  });
  let deleted = 0;
  try {
    for (const id of userIds) {
      const listed = await s3.send(
        new ListObjectsV2Command({ Bucket: STORAGE.bucket, Prefix: `uploads/${id}/` }),
      );
      const keys = (listed.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length === 0) continue;
      await s3.send(
        new DeleteObjectsCommand({ Bucket: STORAGE.bucket, Delete: { Objects: keys } }),
      );
      deleted += keys.length;
    }
  } finally {
    s3.destroy();
  }
  return deleted;
}

/**
 * Removes everything the requirement checks created (accounts on the test domain, their
 * occurrences, photos and emails, and the test categories), leaving the demo data untouched.
 */
export async function cleanup(): Promise<CleanupResult> {
  const pattern = `%@${TEST_EMAIL_DOMAIN}`;
  const userIds = await withDatabase('identity_db', async (db) => {
    const res = await db.query<{ id: string }>(
      'DELETE FROM users WHERE email LIKE $1 RETURNING id',
      [pattern],
    );
    return res.rows.map((r) => r.id);
  });
  const occurrences = await withDatabase('occurrence_db', async (db) => {
    // Duplicates first: the original's foreign key would otherwise be set to null on them.
    const duplicates = await db.query(
      `DELETE FROM occurrences WHERE citizen_email LIKE $1 AND status = 'DUPLICADA'`,
      [pattern],
    );
    const rest = await db.query('DELETE FROM occurrences WHERE citizen_email LIKE $1', [pattern]);
    return (duplicates.rowCount ?? 0) + (rest.rowCount ?? 0);
  });
  const categories = await withDatabase('municipal_db', async (db) => {
    const res = await db.query('DELETE FROM categories WHERE name LIKE $1', [
      `${TEST_CATEGORY_PREFIX}%`,
    ]);
    return res.rowCount ?? 0;
  });
  const photos = await deletePhotos(userIds);
  const emails = await deleteEmailsTo(TEST_EMAIL_DOMAIN);
  return { users: userIds.length, occurrences, categories, photos, emails };
}
