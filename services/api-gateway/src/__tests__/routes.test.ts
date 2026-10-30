import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { OpenAPIObject } from '@nestjs/swagger';
import { repoRoot } from '@sinaliza/service-kit';
import { describe, expect, it } from 'vitest';

import { parseList, parseTrustProxy, SERVICE_NAMES } from '../config.js';
import { publicSpec, toRoutePath } from '../docs/docs.service.js';
import { matchRoute, ROUTES } from '../routing/routes.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function specOf(service: string): OpenAPIObject {
  return JSON.parse(
    readFileSync(join(repoRoot(), 'docs', 'api', `${service}-service.json`), 'utf8'),
  ) as OpenAPIObject;
}

/** `METHOD /path` for every operation of a service except its health check. */
function operations(service: string): string[] {
  return Object.entries(specOf(service).paths)
    .filter(([path]) => path !== '/health')
    .flatMap(([path, item]) =>
      METHODS.filter((m) => item[m]).map((m) => `${m.toUpperCase()} ${toRoutePath(path)}`),
    );
}

describe('route table', () => {
  it('matches the operations published by each service, one to one', () => {
    for (const service of SERVICE_NAMES) {
      const published = operations(service).sort();
      const routed = ROUTES.filter((r) => r.service === service)
        .map((r) => `${r.method} ${r.path}`)
        .sort();
      expect(routed, `${service}-service`).toEqual(published);
    }
  });

  it('marks as public exactly the operations without security in the specs', () => {
    for (const service of SERVICE_NAMES) {
      for (const [path, item] of Object.entries(specOf(service).paths)) {
        if (path === '/health') continue;
        for (const m of METHODS) {
          const op = item[m];
          if (!op) continue;
          const match = matchRoute(m.toUpperCase(), toRoutePath(path));
          expect(match.kind).toBe('route');
          if (match.kind !== 'route') continue;
          const isPublic = !op.security || op.security.length === 0;
          expect(match.rule.access === 'public', `${m} ${path}`).toBe(isPublic);
        }
      }
    }
  });
});

describe('matchRoute', () => {
  it('prefers literal segments and accepts a trailing slash', () => {
    const mine = matchRoute('GET', '/occurrences/mine');
    expect(mine.kind === 'route' && mine.rule.path).toBe('/occurrences/mine');
    const byId = matchRoute('get', '/occurrences/0b7e/');
    expect(byId.kind === 'route' && byId.rule.path).toBe('/occurrences/:id');
  });

  it('reports wrong methods and unknown paths', () => {
    expect(matchRoute('DELETE', '/occurrences/abc')).toEqual({
      kind: 'method-not-allowed',
      allowed: ['GET'],
    });
    expect(matchRoute('GET', '/internal/municipality').kind).toBe('not-found');
    expect(matchRoute('GET', '/health').kind).toBe('not-found');
    expect(matchRoute('GET', '/occurrences/a/b/c').kind).toBe('not-found');
  });
});

describe('publicSpec', () => {
  it('points at the gateway and keeps only routed operations', () => {
    const spec = publicSpec(specOf('occurrence'));
    expect(spec.servers).toEqual([{ url: '/api', description: 'API Gateway' }]);
    expect(spec.paths['/health']).toBeUndefined();
    expect(Object.keys(spec.paths)).toContain('/occurrences/{id}/status');
    expect(Object.keys(publicSpec(specOf('notification')).paths)).toEqual([]);
  });
});

describe('config helpers', () => {
  it('parses lists and trust proxy', () => {
    expect(parseList(' http://a , ,http://b', [])).toEqual(['http://a', 'http://b']);
    expect(parseList(undefined, ['x'])).toEqual(['x']);
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('uniquelocal')).toBe('uniquelocal');
  });
});
