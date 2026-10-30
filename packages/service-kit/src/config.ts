import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

type Env = Record<string, string | undefined>;

export function requireEnv(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function intEnv(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return value;
}

/** The monorepo root (the folder with pnpm-workspace.yaml), or the cwd when not found. */
export function repoRoot(from: string = process.cwd()): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(from);
    dir = parent;
  }
}

/** Relative paths in `.env` are relative to the repository root; Docker uses absolute paths. */
export function resolveFromRoot(path: string): string {
  return isAbsolute(path) ? path : join(repoRoot(), path);
}

/**
 * `DATABASE_URL` wins. Otherwise the URL is built from the shared `.env` variables, so running a
 * service locally needs no extra configuration: DB_HOST (default localhost), POSTGRES_PORT,
 * `<PREFIX>_DB_USER` and `<PREFIX>_DB_PASSWORD`.
 */
export function databaseUrl(env: Env, prefix: string, database: string): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = encodeURIComponent(requireEnv(env, `${prefix}_DB_USER`));
  const password = encodeURIComponent(requireEnv(env, `${prefix}_DB_PASSWORD`));
  const host = env.DB_HOST ?? 'localhost';
  const port = env.POSTGRES_PORT ?? '5432';
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

/** `RABBITMQ_URL` wins; otherwise built from RABBITMQ_HOST/PORT/USER/PASSWORD. */
export function rabbitmqUrl(env: Env): string {
  if (env.RABBITMQ_URL) return env.RABBITMQ_URL;
  const user = encodeURIComponent(requireEnv(env, 'RABBITMQ_USER'));
  const password = encodeURIComponent(requireEnv(env, 'RABBITMQ_PASSWORD'));
  const host = env.RABBITMQ_HOST ?? 'localhost';
  const port = env.RABBITMQ_PORT ?? '5672';
  return `amqp://${user}:${password}@${host}:${port}`;
}
