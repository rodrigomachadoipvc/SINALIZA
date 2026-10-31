import type { ApiError as ApiErrorBody } from '@sinaliza/shared';

import { sessionStore } from '../auth/session-store';
import { apiUrl } from '../config';
import type { Tokens } from './types';

const NETWORK_ERROR =
  'Não foi possível contactar o servidor. Verifique a ligação e tente novamente.';
const GENERIC_ERROR = 'Ocorreu um erro inesperado. Tente novamente.';

/** An error answered by the API, with the PT-PT message ready to show to the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Messages per field, from validation errors (`details: [{ field, messages }]`). */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as Array<{ field?: string; messages?: string[] }>) {
        if (d.field && d.messages?.[0]) out[d.field] = d.messages[0];
      }
    }
    return out;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : GENERIC_ERROR;
}

type Query = Record<string, string | number | undefined | null>;

interface Options {
  json?: unknown;
  query?: Query;
  /** Sends the access token (default) and renews it once when it has expired. */
  auth?: boolean;
  /** Uses this access token instead of the current session's (never renewed). */
  token?: string;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${apiUrl()}${path}${qs ? `?${qs}` : ''}`;
}

async function send(method: string, path: string, options: Options): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  const token =
    options.auth === false ? undefined : (options.token ?? sessionStore.get()?.accessToken);
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    return await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
}

let refreshing: Promise<boolean> | null = null;

/** Renews the access token with the (rotating) refresh token; concurrent callers share one call. */
function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const session = sessionStore.get();
    if (!session) return false;
    const res = await send('POST', '/auth/refresh', {
      json: { refreshToken: session.refreshToken },
      auth: false,
    }).catch(() => null);
    if (!res?.ok) return false;
    const tokens = (await res.json()) as Tokens;
    sessionStore.set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    });
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(method: string, path: string, options: Options = {}): Promise<T> {
  let res = await send(method, path, options);
  if (res.status === 401 && options.auth !== false && !options.token && sessionStore.get()) {
    if (await refreshSession()) {
      res = await send(method, path, options);
    } else {
      sessionStore.set(null, 'expired');
    }
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, err.message ?? GENERIC_ERROR, err.details, err.requestId);
  }
  return body as T;
}
