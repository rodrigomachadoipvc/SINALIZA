import { databaseUrl, intEnv, readPem, requireEnv, resolveFromRoot } from '@sinaliza/service-kit';

export const MUNICIPAL_CONFIG = Symbol('MUNICIPAL_CONFIG');

export interface MunicipalConfig {
  port: number;
  databaseUrl: string;
  jwtPublicKeyPem: string;
  /** Shared secret for the /internal routes used by the occurrence-service. */
  internalToken: string;
  /** GeoJSON with the municipality boundary, loaded into the database at start-up. */
  boundaryGeoJsonPath: string;
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): MunicipalConfig {
  return {
    port: intEnv(env, 'PORT', 3002),
    databaseUrl: databaseUrl(env, 'MUNICIPAL', 'municipal_db'),
    jwtPublicKeyPem:
      env.JWT_PUBLIC_KEY ?? readPem(resolveFromRoot(requireEnv(env, 'JWT_PUBLIC_KEY_PATH'))),
    internalToken: requireEnv(env, 'INTERNAL_API_TOKEN'),
    boundaryGeoJsonPath: resolveFromRoot(
      env.MUNICIPALITY_GEOJSON_PATH ?? 'infra/geo/barcelos.geojson',
    ),
  };
}
