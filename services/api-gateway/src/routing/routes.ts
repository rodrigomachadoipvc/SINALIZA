import { UserRole } from '@sinaliza/shared';

import type { ServiceName } from '../config.js';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** `public`: no token; `authenticated`: any valid token; a role list: one of those roles. */
export type Access = 'public' | 'authenticated' | readonly UserRole[];

export interface RouteRule {
  method: Method;
  /** Path after `/api`, with `:param` segments. */
  path: string;
  service: ServiceName;
  access: Access;
}

const { CIDADAO, GESTOR, ADMIN } = UserRole;
const STAFF = [GESTOR] as const; // ADMIN also satisfies GESTOR (hasRole)
const ADMIN_ONLY = [ADMIN] as const;
const CITIZEN = [CIDADAO] as const;

/**
 * Every public route of the API (spec section 5). Requests that match no rule get 404 here and
 * never reach a service, so `/internal/*` and `/health` of the services are not reachable from
 * outside. A unit test checks this table against the OpenAPI specs in `docs/api/`.
 * The services repeat these checks (defence in depth); this table answers early and keeps
 * unauthorised traffic off the internal network.
 */
export const ROUTES: readonly RouteRule[] = [
  // identity-service
  { method: 'POST', path: '/auth/register', service: 'identity', access: 'public' },
  { method: 'POST', path: '/auth/login', service: 'identity', access: 'public' },
  { method: 'POST', path: '/auth/refresh', service: 'identity', access: 'public' },
  { method: 'POST', path: '/auth/forgot-password', service: 'identity', access: 'public' },
  { method: 'POST', path: '/auth/reset-password', service: 'identity', access: 'public' },
  { method: 'POST', path: '/auth/logout', service: 'identity', access: 'authenticated' },
  { method: 'GET', path: '/users/me', service: 'identity', access: 'authenticated' },
  { method: 'PATCH', path: '/users/me', service: 'identity', access: 'authenticated' },
  { method: 'POST', path: '/users/me/password', service: 'identity', access: 'authenticated' },
  { method: 'GET', path: '/users', service: 'identity', access: ADMIN_ONLY },
  { method: 'POST', path: '/users/gestores', service: 'identity', access: ADMIN_ONLY },
  { method: 'PATCH', path: '/users/:id', service: 'identity', access: ADMIN_ONLY },
  { method: 'POST', path: '/users/:id/deactivate', service: 'identity', access: ADMIN_ONLY },
  { method: 'POST', path: '/users/:id/activate', service: 'identity', access: ADMIN_ONLY },

  // municipal-service
  { method: 'GET', path: '/categories', service: 'municipal', access: 'authenticated' },
  { method: 'POST', path: '/categories', service: 'municipal', access: ADMIN_ONLY },
  { method: 'PATCH', path: '/categories/:id', service: 'municipal', access: ADMIN_ONLY },
  {
    method: 'POST',
    path: '/categories/:id/deactivate',
    service: 'municipal',
    access: ADMIN_ONLY,
  },
  { method: 'POST', path: '/categories/:id/activate', service: 'municipal', access: ADMIN_ONLY },
  { method: 'GET', path: '/municipality', service: 'municipal', access: 'authenticated' },

  // occurrence-service
  { method: 'POST', path: '/locations/validate', service: 'occurrence', access: CITIZEN },
  { method: 'POST', path: '/photos', service: 'occurrence', access: CITIZEN },
  { method: 'POST', path: '/occurrences', service: 'occurrence', access: CITIZEN },
  { method: 'GET', path: '/occurrences', service: 'occurrence', access: STAFF },
  { method: 'GET', path: '/occurrences/mine', service: 'occurrence', access: CITIZEN },
  { method: 'GET', path: '/occurrences/:id', service: 'occurrence', access: 'authenticated' },
  { method: 'POST', path: '/occurrences/:id/cancel', service: 'occurrence', access: CITIZEN },
  { method: 'PATCH', path: '/occurrences/:id/category', service: 'occurrence', access: STAFF },
  { method: 'POST', path: '/occurrences/:id/status', service: 'occurrence', access: STAFF },
  { method: 'POST', path: '/occurrences/:id/duplicate', service: 'occurrence', access: STAFF },
  { method: 'GET', path: '/map/occurrences', service: 'occurrence', access: 'authenticated' },
  { method: 'GET', path: '/map/occurrences/:id', service: 'occurrence', access: 'authenticated' },
  { method: 'GET', path: '/stats/dashboard', service: 'occurrence', access: STAFF },
];

interface CompiledRule extends RouteRule {
  regex: RegExp;
}

function compile(path: string): RegExp {
  const pattern = path
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  return new RegExp(`^${pattern}/?$`);
}

const COMPILED: readonly CompiledRule[] = ROUTES.map((r) => ({ ...r, regex: compile(r.path) }));

export type RouteMatch =
  | { kind: 'route'; rule: RouteRule }
  /** The path exists but not with this method. */
  | { kind: 'method-not-allowed'; allowed: Method[] }
  | { kind: 'not-found' };

/**
 * Finds the rule for a request. Literal paths win over parameters at the same position
 * (`/occurrences/mine` before `/occurrences/:id`) because the table lists them first.
 * `path` is relative to `/api` and has no query string.
 */
export function matchRoute(method: string, path: string): RouteMatch {
  const byPath = COMPILED.filter((r) => r.regex.test(path));
  if (byPath.length === 0) return { kind: 'not-found' };
  const rule = byPath.find((r) => r.method === method.toUpperCase());
  if (rule) return { kind: 'route', rule };
  return { kind: 'method-not-allowed', allowed: [...new Set(byPath.map((r) => r.method))] };
}
