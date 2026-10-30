import {
  databaseUrl,
  intEnv,
  rabbitmqUrl,
  readPem,
  requireEnv,
  resolveFromRoot,
} from '@sinaliza/service-kit';

export const OCCURRENCE_CONFIG = Symbol('OCCURRENCE_CONFIG');

export interface StorageConfig {
  /** Endpoint the service uses (inside Docker: http://storage:9000). */
  endpoint: string;
  /** Endpoint written into pre-signed URLs, reachable by browsers and phones. */
  publicEndpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export interface OccurrenceConfig {
  port: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  jwtPublicKeyPem: string;
  internalToken: string;
  municipalServiceUrl: string;
  storage: StorageConfig;
  photoUrlTtlSeconds: number;
  nominatim: {
    /** Empty disables reverse geocoding (the address falls back to the coordinates). */
    url: string;
    userAgent: string;
    timeoutMs: number;
  };
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): OccurrenceConfig {
  const endpoint = env.S3_ENDPOINT ?? `http://localhost:${env.S3_API_PORT ?? '9000'}`;
  return {
    port: intEnv(env, 'PORT', 3003),
    databaseUrl: databaseUrl(env, 'OCCURRENCE', 'occurrence_db'),
    rabbitmqUrl: rabbitmqUrl(env),
    jwtPublicKeyPem:
      env.JWT_PUBLIC_KEY ?? readPem(resolveFromRoot(requireEnv(env, 'JWT_PUBLIC_KEY_PATH'))),
    internalToken: requireEnv(env, 'INTERNAL_API_TOKEN'),
    municipalServiceUrl: env.MUNICIPAL_SERVICE_URL ?? 'http://localhost:3002',
    storage: {
      endpoint,
      publicEndpoint: env.S3_PUBLIC_ENDPOINT || endpoint,
      region: env.S3_REGION ?? 'us-east-1',
      accessKey: requireEnv(env, 'S3_ACCESS_KEY'),
      secretKey: requireEnv(env, 'S3_SECRET_KEY'),
      bucket: env.S3_BUCKET ?? 'occurrence-photos',
    },
    photoUrlTtlSeconds: intEnv(env, 'PHOTO_URL_TTL_SECONDS', 900),
    nominatim: {
      url: env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org',
      userAgent:
        env.NOMINATIM_USER_AGENT ??
        'Sinaliza/1.0 (+https://github.com/rodrigomachadoipvc/SINALIZA)',
      timeoutMs: intEnv(env, 'NOMINATIM_TIMEOUT_MS', 4000),
    },
  };
}
