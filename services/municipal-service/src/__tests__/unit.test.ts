import { readFileSync } from 'node:fs';

import { repoRoot } from '@sinaliza/service-kit';
import { describe, expect, it } from 'vitest';

import { nextFreeSlug } from '../categories/categories.service.js';
import { extractBoundary } from '../municipality/boundary.js';

const square = [
  [
    [-8.6, 41.5],
    [-8.5, 41.5],
    [-8.5, 41.6],
    [-8.6, 41.5],
  ],
];

describe('extractBoundary', () => {
  it('wraps a Polygon feature into a MultiPolygon and keeps its name', () => {
    expect(
      extractBoundary({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'X' },
            geometry: { type: 'Polygon', coordinates: square },
          },
        ],
      }),
    ).toEqual({ name: 'X', geometry: { type: 'MultiPolygon', coordinates: [square] } });
  });

  it('accepts a bare MultiPolygon', () => {
    const geometry = { type: 'MultiPolygon', coordinates: [square] };
    expect(extractBoundary(geometry)).toEqual({ geometry });
  });

  it.each([
    [{ type: 'FeatureCollection', features: [] }],
    [{ type: 'Point', coordinates: [0, 0] }],
    [null],
  ])('rejects %j', (input) => {
    expect(() => extractBoundary(input)).toThrow();
  });

  it('reads the committed Barcelos boundary', () => {
    const file = `${repoRoot()}/infra/geo/barcelos.geojson`;
    const { name, geometry } = extractBoundary(JSON.parse(readFileSync(file, 'utf8')));
    expect(name).toBe('Barcelos');
    const ring = geometry.coordinates[0]?.[0] ?? [];
    expect(ring.length).toBeGreaterThan(50);
    // Every vertex lies inside the approximate bounding box from the specification.
    for (const [lng, lat] of ring) {
      expect(lng).toBeGreaterThan(-8.8);
      expect(lng).toBeLessThan(-8.45);
      expect(lat).toBeGreaterThan(41.4);
      expect(lat).toBeLessThan(41.67);
    }
  });
});

describe('nextFreeSlug', () => {
  it('uses the base when free, then numbered suffixes', () => {
    expect(nextFreeSlug('parques', new Set())).toBe('parques');
    expect(nextFreeSlug('parques', new Set(['parques']))).toBe('parques-2');
    expect(nextFreeSlug('parques', new Set(['parques', 'parques-2']))).toBe('parques-3');
  });

  it('falls back to "categoria" for names without letters or digits', () => {
    expect(nextFreeSlug('', new Set())).toBe('categoria');
  });
});
