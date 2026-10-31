import {
  databaseUrl,
  intEnv,
  rabbitmqUrl,
  readPem,
  requireEnv,
  resolveFromRoot,
} from '@sinaliza/service-kit';

export const IDENTITY_CONFIG = Symbol('IDENTITY_CONFIG');

export interface IdentityConfig {
  port: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  jwtPrivateKeyPem: string;
  jwtPublicKeyPem: string;
  accessTokenTtl: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  passwordResetTtlMinutes: number;
  /** Public backoffice page that receives `?token=` (RF13). */
  passwordResetUrl: string;
  /** Requests per minute per client IP on login, register and password recovery. */
  authRateLimitPerMinute: number;
}

type Env = Record<string, string | undefined>;

function pem(env: Env, name: string): string {
  return env[name] ?? readPem(resolveFromRoot(requireEnv(env, `${name}_PATH`)));
}

function ttlSeconds(ttl: string): number {
  const match = /^(\d+)([smh])$/.exec(ttl);
  if (!match?.[1] || !match[2]) throw new Error(`JWT_ACCESS_TTL must look like 15m, got "${ttl}"`);
  const unit = { s: 1, m: 60, h: 3600 }[match[2] as 's' | 'm' | 'h'];
  return Number(match[1]) * unit;
}

export function loadConfig(env: Env = process.env): IdentityConfig {
  const accessTokenTtl = env.JWT_ACCESS_TTL ?? '15m';
  return {
    port: intEnv(env, 'PORT', 3001),
    databaseUrl: databaseUrl(env, 'IDENTITY', 'identity_db'),
    rabbitmqUrl: rabbitmqUrl(env),
    jwtPrivateKeyPem: pem(env, 'JWT_PRIVATE_KEY'),
    jwtPublicKeyPem: pem(env, 'JWT_PUBLIC_KEY'),
    accessTokenTtl,
    accessTokenTtlSeconds: ttlSeconds(accessTokenTtl),
    refreshTokenTtlDays: intEnv(env, 'JWT_REFRESH_TTL_DAYS', 7),
    passwordResetTtlMinutes: intEnv(env, 'PASSWORD_RESET_TTL_MINUTES', 30),
    passwordResetUrl: env.PASSWORD_RESET_URL ?? 'http://localhost:8081/redefinir-palavra-passe',
    authRateLimitPerMinute: intEnv(env, 'AUTH_RATE_LIMIT_PER_MINUTE', 10),
  };
}
