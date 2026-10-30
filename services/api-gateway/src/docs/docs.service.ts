import { Inject, Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

import { GATEWAY_CONFIG, type GatewayConfig, type ServiceName } from '../config.js';
import { matchRoute } from '../routing/routes.js';

const CACHE_MS = 60_000;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** `/occurrences/{id}` (OpenAPI) → `/occurrences/:id` (route table) for matching. */
export const toRoutePath = (path: string): string => path.replace(/\{([^}]+)\}/g, ':$1');

/**
 * Rewrites a service spec so «Try it out» goes through the gateway: server `/api` and only the
 * operations the gateway exposes (no `/health`, no `/internal`).
 */
export function publicSpec(spec: OpenAPIObject): OpenAPIObject {
  const paths: OpenAPIObject['paths'] = {};
  for (const [path, item] of Object.entries(spec.paths)) {
    const kept = { ...item };
    for (const method of METHODS) {
      if (kept[method] && matchRoute(method.toUpperCase(), toRoutePath(path)).kind !== 'route') {
        delete kept[method];
      }
    }
    if (METHODS.some((m) => kept[m])) paths[path] = kept;
  }
  return { ...spec, servers: [{ url: '/api', description: 'API Gateway' }], paths };
}

/** Fetches each service's live OpenAPI document (cached for a minute). */
@Injectable()
export class DocsService {
  private readonly cache = new Map<ServiceName, { at: number; spec: OpenAPIObject }>();

  constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  async spec(service: ServiceName): Promise<OpenAPIObject | null> {
    const cached = this.cache.get(service);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.spec;
    try {
      const res = await fetch(new URL('/docs/openapi.json', this.config.services[service]), {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return cached?.spec ?? null;
      const spec = publicSpec((await res.json()) as OpenAPIObject);
      this.cache.set(service, { at: Date.now(), spec });
      return spec;
    } catch {
      return cached?.spec ?? null;
    }
  }
}
