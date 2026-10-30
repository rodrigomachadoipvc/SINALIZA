import { OccurrenceStatus } from '@sinaliza/shared';
import { describe, expect, it } from 'vitest';

import { parseBBox } from '../common/validation.js';
import { cacheKey, coordinatesLabel, formatAddress } from '../integrations/geocoder.service.js';
import { daysOpen } from '../occurrences/occurrences.service.js';
import { resolvePeriod } from '../stats/stats.controller.js';

describe('formatAddress', () => {
  it('joins street, number and parish', () => {
    expect(
      formatAddress({
        address: { road: 'Rua Dr. Manuel Pais', house_number: '12', suburb: 'Arcozelo' },
      }),
    ).toBe('Rua Dr. Manuel Pais 12, Arcozelo');
  });

  it('works without a house number or street', () => {
    expect(formatAddress({ address: { road: 'Avenida da Liberdade', city: 'Barcelos' } })).toBe(
      'Avenida da Liberdade, Barcelos',
    );
    expect(formatAddress({ address: { village: 'Lijó' } })).toBe('Lijó');
  });

  it('falls back to the first parts of display_name, then to null', () => {
    expect(formatAddress({ display_name: 'Campo da Feira, Barcelos, Braga, Portugal' })).toBe(
      'Campo da Feira, Barcelos',
    );
    expect(formatAddress({})).toBeNull();
  });
});

describe('geocoder keys', () => {
  it('rounds the cache key to 4 decimals and the label to 5', () => {
    expect(cacheKey(41.531749, -8.619449)).toBe('41.5317,-8.6194');
    expect(coordinatesLabel(41.5317, -8.6194)).toBe('41.53170, -8.61940');
  });
});

describe('parseBBox', () => {
  it('parses west,south,east,north', () => {
    expect(parseBBox('-8.65, 41.52,-8.60,41.55')).toEqual({
      minLng: -8.65,
      minLat: 41.52,
      maxLng: -8.6,
      maxLat: 41.55,
    });
  });

  it.each(['', '1,2,3', 'a,b,c,d', '-8.6,41.55,-8.65,41.52', '0,95,1,96', '-190,0,0,1'])(
    'rejects %j',
    (value) => {
      expect(parseBBox(value)).toBeNull();
    },
  );
});

describe('daysOpen', () => {
  const createdAt = new Date('2026-10-01T10:00:00Z');
  const now = new Date('2026-10-11T09:00:00Z');

  it('counts until now while the occurrence is open', () => {
    expect(
      daysOpen(
        { status: OccurrenceStatus.EM_ANALISE, createdAt, resolvedAt: null, updatedAt: createdAt },
        now,
      ),
    ).toBe(9);
  });

  it('counts until the resolution, or the last change, once closed', () => {
    expect(
      daysOpen(
        {
          status: OccurrenceStatus.RESOLVIDA,
          createdAt,
          resolvedAt: new Date('2026-10-04T10:00:00Z'),
          updatedAt: now,
        },
        now,
      ),
    ).toBe(3);
    expect(
      daysOpen(
        {
          status: OccurrenceStatus.REJEITADA,
          createdAt,
          resolvedAt: null,
          updatedAt: new Date('2026-10-02T11:00:00Z'),
        },
        now,
      ),
    ).toBe(1);
  });
});

describe('resolvePeriod', () => {
  const now = new Date('2026-10-30T23:30:00Z'); // Lisbon is on UTC+0 in winter.

  it('defaults to the current month and the 11 before it', () => {
    expect(resolvePeriod({}, now)).toEqual({ from: '2025-11-01', to: '2026-10-30' });
  });

  it('uses the Lisbon calendar day', () => {
    // 23:30 UTC on 15 August is 00:30 on 16 August in Lisbon (UTC+1 in summer).
    expect(resolvePeriod({}, new Date('2026-08-15T23:30:00Z')).to).toBe('2026-08-16');
  });

  it('keeps explicit dates and rejects inverted or too long periods', () => {
    expect(resolvePeriod({ from: '2026-01-01', to: '2026-03-31' }, now)).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(() => resolvePeriod({ from: '2026-04-01', to: '2026-03-31' }, now)).toThrow();
    expect(() => resolvePeriod({ from: '2018-01-01', to: '2026-03-31' }, now)).toThrow();
  });
});
