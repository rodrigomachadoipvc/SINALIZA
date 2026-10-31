import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

import { useSession } from '../auth/session';
import { API_URL } from '../config';
import { t } from '../i18n/pt-PT';
import type { Tokens } from './types';

/** Error with a message the person can read, plus the field errors the API returned. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  message?: unknown;
  details?: unknown;
}

function fieldErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(details)) return out;
  for (const d of details as Array<{ field?: unknown; messages?: unknown }>) {
    if (
      typeof d.field === 'string' &&
      Array.isArray(d.messages) &&
      typeof d.messages[0] === 'string'
    )
      out[d.field] = d.messages[0];
  }
  return out;
}

/**
 * Maps any failure to a human message. The API already answers in PT-PT for validation and
 * business errors (4xx), so those messages are kept; the rest get a fixed text.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AxiosError) {
    const status = error.response?.status ?? 0;
    const body = (error.response?.data ?? {}) as ErrorBody;
    if (status === 0) return new ApiError(0, t.erros.rede);
    if (status === 429) return new ApiError(429, t.erros.demasiadosPedidos);
    if (status >= 500) return new ApiError(status, t.erros.servidor);
    if (status === 403) return new ApiError(403, t.erros.semPermissao);
    const message = typeof body.message === 'string' ? body.message : t.erros.generico;
    return new ApiError(status, message, fieldErrors(body.details));
  }
  return new ApiError(0, t.erros.generico);
}

export function errorMessage(error: unknown): string {
  return toApiError(error).message;
}

export const http = axios.create({ baseURL: API_URL, timeout: 20_000 });

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
  /** Public endpoints (login, register, …) never send or renew a token. */
  _public?: boolean;
}

http.interceptors.request.use((config: RetriableConfig) => {
  const token = useSession.getState().session?.accessToken;
  if (token && !config._public) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

let refreshing: Promise<boolean> | null = null;

/** Renews the access token with the rotating refresh token; concurrent 401s share one call. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = useSession.getState().session?.refreshToken;
    if (!refreshToken) return false;
    try {
      const { data } = await axios.post<Tokens>(`${API_URL}/auth/refresh`, { refreshToken });
      await useSession.getState().replaceTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

http.interceptors.response.use(undefined, async (error: unknown) => {
  if (!(error instanceof AxiosError) || !error.config) throw toApiError(error);
  const config = error.config as RetriableConfig;
  const hasSession = useSession.getState().session !== null;
  if (error.response?.status === 401 && !config._retried && !config._public && hasSession) {
    config._retried = true;
    if (await refreshSession()) return http.request(config);
    await useSession.getState().signOut();
    throw new ApiError(401, t.erros.sessaoExpirada);
  }
  throw toApiError(error);
});

/** Small typed wrappers; every call resolves to the response body. */
export type QueryParams = Record<string, string | number | boolean | undefined>;

export async function get<T>(path: string, params?: QueryParams): Promise<T> {
  return (await http.get<T>(path, { params })).data;
}

export async function post<T>(path: string, body?: unknown, isPublic = false): Promise<T> {
  return (await http.post<T>(path, body, { _public: isPublic } as AxiosRequestConfig)).data;
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
  return (await http.patch<T>(path, body)).data;
}
