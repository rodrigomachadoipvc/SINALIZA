import { randomUUID } from 'node:crypto';

import { DEFAULT_CATEGORIES, EventType, OccurrenceStatus } from '@sinaliza/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma.service.js';
import {
  currentStatus,
  DEMO_GESTOR,
  DEMO_OCCURRENCES,
  MARIA,
  OTHER_CITIZENS,
  seedId,
} from '../src/seed/demo-data.js';
import { type SeedDirectory, seedOccurrences } from '../src/seed/seed-occurrences.js';
import { CATEGORIES, type Harness, PLACES, startHarness, USERS } from './harness.js';

const S = OccurrenceStatus;

function directory(): SeedDirectory {
  const users: SeedDirectory['users'] = new Map();
  users.set(MARIA, { id: USERS.maria.id, name: USERS.maria.name, email: MARIA });
  users.set(DEMO_GESTOR, { id: USERS.gestor.id, name: USERS.gestor.name, email: DEMO_GESTOR });
  for (const email of OTHER_CITIZENS) users.set(email, { id: randomUUID(), name: email, email });
  const categories: SeedDirectory['categories'] = new Map(
    DEFAULT_CATEGORIES.map((c) => [c.slug, { id: randomUUID(), name: c.name, slug: c.slug }]),
  );
  return { users, categories };
}

describe('demo seed (e2e)', () => {
  let h: Harness;
  let prisma: PrismaService;
  const dir = directory();
  const cancelled = DEMO_OCCURRENCES.filter((o) => currentStatus(o) === S.ANULADA).length;

  beforeAll(async () => {
    h = await startHarness();
    prisma = h.app.get(PrismaService);
  });

  afterAll(async () => {
    await h?.stop();
  });

  it('refuses to run when a user is missing, without writing anything', async () => {
    const incomplete = directory();
    incomplete.users.delete(OTHER_CITIZENS[0]);
    await expect(seedOccurrences(prisma, incomplete)).rejects.toThrow(
      /joao\.martins@example\.com.*identity-service/,
    );
    await expect(prisma.occurrence.count()).resolves.toBe(0);
  });

  it('inserts every demo occurrence with its history, and is idempotent', async () => {
    const first = await seedOccurrences(prisma, dir);
    expect(first).toEqual({ created: DEMO_OCCURRENCES.length, existing: 0, conflicts: [] });

    const again = await seedOccurrences(prisma, dir);
    expect(again).toEqual({ created: 0, existing: DEMO_OCCURRENCES.length, conflicts: [] });

    await expect(prisma.occurrence.count()).resolves.toBe(DEMO_OCCURRENCES.length);
    await expect(prisma.statusHistory.count()).resolves.toBe(
      DEMO_OCCURRENCES.reduce((n, o) => n + 1 + o.steps.length, 0),
    );
    const counter = await prisma.referenceCounter.findUnique({ where: { year: 2026 } });
    expect(counter?.lastValue).toBe(482);
  });

  it("shows Maria's occurrences to her, with the history from the prototype", async () => {
    const mine = await h
      .http()
      .get('/occurrences/mine?pageSize=50')
      .set(h.auth('maria'))
      .expect(200);
    expect(
      (mine.body.items as Array<{ reference: string; status: string }>).map((o) => [
        o.reference,
        o.status,
      ]),
    ).toEqual([
      ['SIN-2026-00482', S.RECEBIDA],
      ['SIN-2026-00451', S.EM_RESOLUCAO],
      ['SIN-2026-00397', S.RESOLVIDA],
      ['SIN-2026-00310', S.DUPLICADA],
    ]);

    const detail = await h
      .http()
      .get(`/occurrences/${seedId('SIN-2026-00310')}`)
      .set(h.auth('maria'))
      .expect(200);
    expect(detail.body.original).toEqual({
      id: seedId('SIN-2026-00287'),
      reference: 'SIN-2026-00287',
    });

    const resolved = await h
      .http()
      .get(`/occurrences/${seedId('SIN-2026-00397')}`)
      .set(h.auth('maria'))
      .expect(200);
    expect(
      (resolved.body.history as Array<{ from: string | null; to: string }>).map((e) => e.to),
    ).toEqual([S.RECEBIDA, S.EM_ANALISE, S.EM_RESOLUCAO, S.RESOLVIDA]);
    expect(resolved.body.resolvedAt).toBe('2026-08-31T16:25:00.000Z');
  });

  it('feeds the public map, the staff list and the dashboard', async () => {
    const map = await h.http().get('/map/occurrences').set(h.auth('joao')).expect(200);
    expect(map.body.items).toHaveLength(DEMO_OCCURRENCES.length - cancelled);

    const rejected = await h
      .http()
      .get('/occurrences?status=REJEITADA')
      .set(h.auth('gestor'))
      .expect(200);
    expect(rejected.body.total).toBeGreaterThanOrEqual(3);

    const stats = await h
      .http()
      .get('/stats/dashboard?from=2026-01-01&to=2026-10-31')
      .set(h.auth('gestor'))
      .expect(200);
    expect(stats.body.totals.total).toBe(DEMO_OCCURRENCES.length - cancelled);
    expect(stats.body.totals.avgResolutionDays).toBeGreaterThan(0);
  });

  it('continues the reference sequence after the demo data', async () => {
    const res = await h
      .http()
      .post('/occurrences')
      .set(h.auth('maria'))
      .send({
        categoryId: CATEGORIES.vias.id,
        description: 'Ocorrência criada depois do seed.',
        ...PLACES.camara,
      })
      .expect(201);
    const year = new Date().getFullYear();
    expect(res.body.reference).toBe(year === 2026 ? 'SIN-2026-00483' : `SIN-${year}-00001`);
    // Seeding publishes nothing; creating through the API does.
    await h.waitForEvent(EventType.OCCURRENCE_CREATED, (e) => e.payload.id === res.body.id);
    expect(h.events).toHaveLength(1);
  });
});
