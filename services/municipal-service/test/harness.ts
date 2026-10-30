import { generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { JwtSigner, repoRoot } from '@sinaliza/service-kit';
import { UserRole } from '@sinaliza/shared';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import request from 'supertest';

import { createApp } from '../src/app.js';
import type { MunicipalConfig } from '../src/config.js';

export const INTERNAL_TOKEN = 'test-internal-token';

export interface Harness {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  db: pg.Client;
  /** Access tokens signed with the test key pair, one per role. */
  tokens: Record<UserRole, string>;
  restart: () => Promise<void>;
  stop: () => Promise<void>;
}

async function applyMigrations(client: pg.Client): Promise<void> {
  const dir = join(import.meta.dirname, '..', 'prisma', 'migrations');
  for (const name of readdirSync(dir)
    .filter((n) => /^\d+_/.test(n))
    .sort()) {
    await client.query(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
  }
}

export async function startHarness(): Promise<Harness> {
  const postgres: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgis/postgis:16-3.6-alpine',
  )
    .withDatabase('municipal_db')
    .start();
  const db = new pg.Client({ connectionString: postgres.getConnectionUri() });
  await db.connect();
  await applyMigrations(db);

  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const signer = await JwtSigner.fromPem(keys.privateKey, '15m');
  const tokens = {} as Record<UserRole, string>;
  for (const role of Object.values(UserRole)) {
    tokens[role] = await signer.sign({
      id: `00000000-0000-4000-8000-00000000000${role.length}`,
      role,
      email: `${role.toLowerCase()}@test.pt`,
      name: role,
    });
  }

  const config: MunicipalConfig = {
    port: 0,
    databaseUrl: postgres.getConnectionUri(),
    jwtPublicKeyPem: keys.publicKey,
    internalToken: INTERNAL_TOKEN,
    boundaryGeoJsonPath: join(repoRoot(), 'infra', 'geo', 'barcelos.geojson'),
  };

  const boot = async (): Promise<INestApplication> => {
    const { app } = await createApp(config, ['error', 'warn']);
    await app.init();
    return app;
  };

  const harness: Harness = {
    app: await boot(),
    http: () => request(harness.app.getHttpServer()),
    db,
    tokens,
    restart: async () => {
      await harness.app.close();
      harness.app = await boot();
    },
    stop: async () => {
      await harness.app.close();
      await db.end();
      await postgres.stop();
    },
  };
  return harness;
}
