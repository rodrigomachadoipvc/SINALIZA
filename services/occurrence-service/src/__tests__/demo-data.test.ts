import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '@sinaliza/service-kit';
import {
  checkDuplicateTarget,
  checkTransition,
  OccurrenceStatus,
  parseReference,
  UserRole,
} from '@sinaliza/shared';
import { describe, expect, it } from 'vitest';

import {
  changedByRole,
  currentStatus,
  DEMO_OCCURRENCES,
  LAST_DEMO_SEQUENCE,
  MARIA,
  SEED_NOW,
  seedId,
} from '../seed/demo-data.js';

const S = OccurrenceStatus;
const byReference = new Map(DEMO_OCCURRENCES.map((o) => [o.reference, o]));

type Ring = Array<[number, number]>;

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

describe('demo occurrences', () => {
  it("include Maria's four from the prototype", () => {
    const maria = DEMO_OCCURRENCES.filter((o) => o.citizenEmail === MARIA);
    expect(
      maria.map((o) => [o.reference, o.category, currentStatus(o), o.address.split(',')[0]]),
    ).toEqual([
      ['SIN-2026-00310', 'passeios', S.DUPLICADA, 'Avenida dos Combatentes da Grande Guerra'],
      ['SIN-2026-00397', 'residuos', S.RESOLVIDA, 'Largo da Porta Nova'],
      ['SIN-2026-00451', 'vias', S.EM_RESOLUCAO, 'Rua D. António Barroso'],
      ['SIN-2026-00482', 'iluminacao', S.RECEBIDA, 'Rua Dr. Manuel Pais'],
    ]);
    expect(byReference.get('SIN-2026-00310')?.originalReference).toBe('SIN-2026-00287');
    expect(byReference.get('SIN-2026-00482')?.description).toBe(
      'O candeeiro junto à passadeira está apagado há uma semana. À noite a passadeira fica sem iluminação.',
    );
  });

  it('have about forty more from other citizens, covering every status and category', () => {
    const others = DEMO_OCCURRENCES.filter((o) => o.citizenEmail !== MARIA);
    expect(others.length).toBeGreaterThanOrEqual(40);
    expect(new Set(others.map((o) => o.citizenEmail)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(DEMO_OCCURRENCES.map(currentStatus))).toEqual(new Set(Object.values(S)));
    expect(new Set(DEMO_OCCURRENCES.map((o) => o.category)).size).toBe(6);
  });

  it('have unique, well-formed references, ids and valid descriptions', () => {
    expect(byReference.size).toBe(DEMO_OCCURRENCES.length);
    expect(new Set(DEMO_OCCURRENCES.map((o) => o.id)).size).toBe(DEMO_OCCURRENCES.length);
    for (const o of DEMO_OCCURRENCES) {
      expect(parseReference(o.reference)?.year, o.reference).toBe(2026);
      expect(o.id).toBe(seedId(o.reference));
      expect(o.description.length, o.reference).toBeGreaterThanOrEqual(10);
      expect(o.description.length, o.reference).toBeLessThanOrEqual(500);
      expect(o.address.length).toBeLessThanOrEqual(300);
    }
    expect(LAST_DEMO_SEQUENCE).toBe(482);
  });

  it('get newer as the reference grows, and never happen after SEED_NOW', () => {
    let previous = 0;
    for (const o of DEMO_OCCURRENCES) {
      expect(o.createdAt.getTime(), o.reference).toBeGreaterThan(previous);
      previous = o.createdAt.getTime();
      let last = o.createdAt.getTime();
      for (const step of o.steps) {
        expect(step.at.getTime(), `${o.reference} → ${step.to}`).toBeGreaterThan(last);
        last = step.at.getTime();
      }
      expect(last, o.reference).toBeLessThanOrEqual(SEED_NOW.getTime());
    }
  });

  it('follow the state machine, step by step', () => {
    for (const o of DEMO_OCCURRENCES) {
      let from: OccurrenceStatus = S.RECEBIDA;
      for (const step of o.steps) {
        const role = changedByRole(step);
        const result = checkTransition({
          from,
          to: step.to,
          role,
          isAuthor: role === UserRole.CIDADAO,
          reason: step.reason,
          originalId: o.originalReference,
        });
        expect(result, `${o.reference}: ${from} → ${step.to}`).toEqual({ ok: true });
        from = step.to;
      }
    }
  });

  it('point duplicates at an older, valid original of the same category', () => {
    const duplicates = DEMO_OCCURRENCES.filter((o) => currentStatus(o) === S.DUPLICADA);
    expect(duplicates.length).toBeGreaterThanOrEqual(2);
    for (const o of duplicates) {
      const original = byReference.get(o.originalReference ?? '');
      expect(original, o.reference).toBeDefined();
      if (!original) continue;
      expect(original.reference < o.reference).toBe(true);
      expect(original.category).toBe(o.category);
      expect(
        checkDuplicateTarget(o.id, { id: original.id, status: currentStatus(original) }),
      ).toEqual({ ok: true });
    }
  });

  it('are all inside the municipality boundary', () => {
    const geojson = JSON.parse(
      readFileSync(join(repoRoot(), 'infra', 'geo', 'barcelos.geojson'), 'utf8'),
    ) as { features: Array<{ geometry: { coordinates: Ring[][] } }> };
    const polygons = geojson.features[0]?.geometry.coordinates ?? [];
    for (const o of DEMO_OCCURRENCES) {
      const inside = polygons.some(
        ([outer, ...holes]) =>
          outer !== undefined &&
          inRing(o.lng, o.lat, outer) &&
          !holes.some((h) => inRing(o.lng, o.lat, h)),
      );
      expect(inside, `${o.reference} ${o.address}`).toBe(true);
    }
  });
});

describe('seedId', () => {
  it('is a stable UUID (version 5 layout)', () => {
    expect(seedId('SIN-2026-00482')).toBe(seedId('SIN-2026-00482'));
    expect(seedId('SIN-2026-00482')).not.toBe(seedId('SIN-2026-00481'));
    expect(seedId('SIN-2026-00482')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
