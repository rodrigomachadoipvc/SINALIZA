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

export interface DatabricksConfig {
  /** Workspace URL, e.g. https://dbc-1234abcd-5678.cloud.databricks.com */
  host: string;
  token: string;
  warehouseId: string;
  catalog: string;
  /** How long a computed dashboard is reused (the gold tables change once a day). */
  cacheTtlMs: number;
  timeoutMs: number;
}

/** Where `/stats/dashboard` reads from (ANALYTICS_SOURCE). */
export type AnalyticsConfig =
  { source: 'postgres' } | { source: 'databricks'; databricks: DatabricksConfig };

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
  analytics: AnalyticsConfig;
}

type Env = Record<string, string | undefined>;

export function loadAnalyticsConfig(env: Env): AnalyticsConfig {
  const source = env.ANALYTICS_SOURCE || 'postgres';
  if (source === 'postgres') return { source };
  if (source !== 'databricks') {
    throw new Error(`ANALYTICS_SOURCE must be "postgres" or "databricks", got "${source}"`);
  }
  const rawHost = requireEnv(env, 'DATABRICKS_HOST').replace(/\/+$/, '');
  const host = /^https?:\/\//.test(rawHost) ? rawHost : `https://${rawHost}`;
  if (!host.startsWith('https://')) throw new Error('DATABRICKS_HOST must use https');
  const catalog = env.DATABRICKS_CATALOG || 'sinaliza';
  if (!/^[a-z_][a-z0-9_]*$/.test(catalog))
    throw new Error(`Invalid DATABRICKS_CATALOG "${catalog}"`);
  return {
    source,
    databricks: {
      host,
      token: requireEnv(env, 'DATABRICKS_TOKEN'),
      warehouseId: requireEnv(env, 'DATABRICKS_WAREHOUSE_ID'),
      catalog,
      cacheTtlMs: intEnv(env, 'ANALYTICS_CACHE_SECONDS', 600) * 1000,
      timeoutMs: intEnv(env, 'DATABRICKS_TIMEOUT_MS', 60_000),
    },
  };
}

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
    analytics: loadAnalyticsConfig(env),
  };
}
