import { intEnv, readPem, requireEnv, resolveFromRoot } from '@sinaliza/service-kit';

export const GATEWAY_CONFIG = Symbol('GATEWAY_CONFIG');

export const SERVICE_NAMES = ['identity', 'municipal', 'occurrence', 'notification'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export interface GatewayConfig {
  port: number;
  jwtPublicKeyPem: string;
  /** Base URL of each service (inside Docker: http://<name>-service:3000). */
  services: Record<ServiceName, string>;
  /** Browser origins allowed by CORS (the backoffice). The mobile app does not need CORS. */
  corsOrigins: string[];
  /** Requests per minute per client IP on /api. */
  rateLimitPerMinute: number;
  /**
   * Express `trust proxy`: which hops may set X-Forwarded-For. `false` locally (clients connect
   * directly); in the cloud the Caddy container on the private network.
   */
  trustProxy: boolean | string;
  proxyTimeoutMs: number;
}

type Env = Record<string, string | undefined>;

export function parseList(raw: string | undefined, fallback: string[]): string[] {
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseTrustProxy(raw: string | undefined): boolean | string {
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  return raw;
}

export function loadConfig(env: Env = process.env): GatewayConfig {
  return {
    port: intEnv(env, 'PORT', 8080),
    jwtPublicKeyPem:
      env.JWT_PUBLIC_KEY ?? readPem(resolveFromRoot(requireEnv(env, 'JWT_PUBLIC_KEY_PATH'))),
    services: {
      identity: env.IDENTITY_SERVICE_URL ?? 'http://localhost:3001',
      municipal: env.MUNICIPAL_SERVICE_URL ?? 'http://localhost:3002',
      occurrence: env.OCCURRENCE_SERVICE_URL ?? 'http://localhost:3003',
      notification: env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3004',
    },
    corsOrigins: parseList(env.CORS_ORIGINS, ['http://localhost:5173', 'http://localhost:8081']),
    rateLimitPerMinute: intEnv(env, 'RATE_LIMIT_PER_MINUTE', 300),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    proxyTimeoutMs: intEnv(env, 'PROXY_TIMEOUT_MS', 30_000),
  };
}
