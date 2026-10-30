import { OccurrenceStatus, UserRole } from '@sinaliza/shared';

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  changedByRole,
  currentStatus,
  DEMO_GESTOR,
  DEMO_OCCURRENCES,
  type DemoCategory,
  type DemoOccurrence,
  LAST_DEMO_SEQUENCE,
  SEED_YEAR,
  seedId,
} from './demo-data.js';

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
}

export interface DirectoryCategory {
  id: string;
  name: string;
  slug: string;
}

/** The users and categories the demo data refers to, owned by the identity and municipal services. */
export interface SeedDirectory {
  users: Map<string, DirectoryUser>;
  categories: Map<string, DirectoryCategory>;
}

export interface SeedResult {
  created: number;
  existing: number;
  /** References already used by other occurrences (left untouched). */
  conflicts: string[];
}

const MISSING_USER = 'Corra primeiro o seed do identity-service.';
const MISSING_CATEGORY = 'Arranque primeiro o municipal-service (cria as categorias).';

function required<T>(map: Map<string, T>, key: string, hint: string): T {
  const value = map.get(key);
  if (!value) throw new Error(`seed: «${key}» não existe. ${hint}`);
  return value;
}

/** Fails before writing anything if a demo point is outside the cached municipality boundary. */
async function checkLocations(prisma: PrismaClient): Promise<void> {
  const [cached] = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM boundary_cache
  `;
  if (!cached || cached.n === 0n) {
    throw new Error(
      'seed: o limite do concelho ainda não está em cache. Arranque o occurrence-service antes do seed.',
    );
  }
  const outside = await prisma.$queryRaw<Array<{ reference: string }>>`
    SELECT t.reference
    FROM unnest(
      ${DEMO_OCCURRENCES.map((o) => o.reference)}::text[],
      ${DEMO_OCCURRENCES.map((o) => o.lat)}::float8[],
      ${DEMO_OCCURRENCES.map((o) => o.lng)}::float8[]
    ) AS t(reference, lat, lng)
    WHERE NOT EXISTS (
      SELECT 1 FROM boundary_cache b
      WHERE ST_Contains(b.boundary, ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326))
    )
  `;
  if (outside.length > 0) {
    throw new Error(
      `seed: localizações fora do concelho: ${outside.map((r) => r.reference).join(', ')}`,
    );
  }
}

async function insertOccurrence(
  prisma: PrismaClient,
  o: DemoOccurrence,
  citizen: DirectoryUser,
  gestor: DirectoryUser,
  category: DirectoryCategory,
): Promise<void> {
  const status = currentStatus(o);
  const last = o.steps.at(-1);
  const updatedAt = last?.at ?? o.createdAt;
  const resolvedAt = o.steps.find((s) => s.to === OccurrenceStatus.RESOLVIDA)?.at ?? null;
  const cancelledAt = o.steps.find((s) => s.to === OccurrenceStatus.ANULADA)?.at ?? null;
  const rejectionReason = o.steps.find((s) => s.to === OccurrenceStatus.REJEITADA)?.reason ?? null;
  const originalId = o.originalReference ? seedId(o.originalReference) : null;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO occurrences (
        id, reference, citizen_id, citizen_name, citizen_email,
        category_id, category_name, category_slug, description, status,
        location, address, original_id, rejection_reason,
        created_at, updated_at, resolved_at, cancelled_at
      ) VALUES (
        ${o.id}::uuid, ${o.reference}, ${citizen.id}::uuid, ${citizen.name}, ${citizen.email},
        ${category.id}::uuid, ${category.name}, ${category.slug}, ${o.description},
        ${status}::occurrence_status,
        ST_SetSRID(ST_MakePoint(${o.lng}, ${o.lat}), 4326)::geography,
        ${o.address}, ${originalId}::uuid, ${rejectionReason},
        ${o.createdAt}, ${updatedAt}, ${resolvedAt}, ${cancelledAt}
      )
    `;
    let from: OccurrenceStatus = OccurrenceStatus.RECEBIDA;
    const history: Prisma.StatusHistoryCreateManyInput[] = [
      {
        occurrenceId: o.id,
        fromStatus: null,
        toStatus: OccurrenceStatus.RECEBIDA,
        changedBy: citizen.id,
        changedByRole: UserRole.CIDADAO,
        changedAt: o.createdAt,
      },
    ];
    for (const step of o.steps) {
      history.push({
        occurrenceId: o.id,
        fromStatus: from,
        toStatus: step.to,
        ...(step.note ? { note: step.note } : {}),
        ...(step.reason ? { reason: step.reason } : {}),
        changedBy: step.by === 'AUTHOR' ? citizen.id : gestor.id,
        changedByRole: changedByRole(step),
        changedAt: step.at,
      });
      from = step.to;
    }
    await tx.statusHistory.createMany({ data: history });
  });
}

/**
 * Inserts the demo occurrences that are not there yet (idempotent: ids are derived from the
 * references) and moves the reference counter past them, so new reports get the next number.
 * Written directly to the database because the API cannot backdate occurrences or their history;
 * no events are published, so seeding sends no emails.
 */
export async function seedOccurrences(
  prisma: PrismaClient,
  directory: SeedDirectory,
): Promise<SeedResult> {
  await checkLocations(prisma);
  const gestor = required(directory.users, DEMO_GESTOR, MISSING_USER);
  const result: SeedResult = { created: 0, existing: 0, conflicts: [] };

  for (const o of DEMO_OCCURRENCES) {
    const found = await prisma.occurrence.findUnique({
      where: { reference: o.reference },
      select: { id: true },
    });
    if (found) {
      if (found.id === o.id) result.existing++;
      else result.conflicts.push(o.reference);
      continue;
    }
    if (o.originalReference && result.conflicts.includes(o.originalReference)) {
      result.conflicts.push(o.reference);
      continue;
    }
    await insertOccurrence(
      prisma,
      o,
      required(directory.users, o.citizenEmail, MISSING_USER),
      gestor,
      required(directory.categories, o.category satisfies DemoCategory, MISSING_CATEGORY),
    );
    result.created++;
  }

  await prisma.$executeRaw`
    INSERT INTO reference_counters (year, last_value) VALUES (${SEED_YEAR}, ${LAST_DEMO_SEQUENCE})
    ON CONFLICT (year) DO UPDATE
      SET last_value = GREATEST(reference_counters.last_value, EXCLUDED.last_value)
  `;
  return result;
}
