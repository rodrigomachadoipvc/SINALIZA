import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The same `.env` as docker compose: database, storage and port settings for the cleanup.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

export const API_URL = (
  env.SINALIZA_API_URL ?? `http://localhost:${env.GATEWAY_PORT ?? '8080'}/api`
).replace(/\/+$/, '');
export const MAILPIT_URL = (
  env.MAILPIT_URL ?? `http://localhost:${env.MAILPIT_UI_PORT ?? '8025'}`
).replace(/\/+$/, '');

/** Every account these checks create uses this domain, so the cleanup can find them. */
export const TEST_EMAIL_DOMAIN = 'verificar.sinaliza.test';
/** Prefix of the categories these checks create. */
export const TEST_CATEGORY_PREFIX = 'Verificação ';

export const DEMO = {
  admin: { email: 'admin@sinaliza.pt', password: 'Admin12345' },
  gestor: { email: 'gestor@sinaliza.pt', password: 'Gestor12345' },
  maria: { email: 'maria.fernandes@email.pt', password: 'Cidada12345' },
} as const;

export function required(name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Defina ${name} no .env`);
  return value;
}

export const POSTGRES = {
  host: env.DB_HOST ?? 'localhost',
  port: Number(env.POSTGRES_PORT ?? '5432'),
};

export const STORAGE = {
  endpoint: env.S3_ENDPOINT ?? `http://localhost:${env.S3_API_PORT ?? '9000'}`,
  region: env.S3_REGION ?? 'us-east-1',
  bucket: env.S3_BUCKET ?? 'occurrence-photos',
};
