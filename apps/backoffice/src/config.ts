declare global {
  interface Window {
    SINALIZA_CONFIG?: { apiUrl?: string };
  }
}

/**
 * Gateway address. In Docker it comes from `/config.js`, written at start-up from API_URL, so the
 * same image works locally and in the cloud; `VITE_API_URL` overrides it in development.
 */
export function apiUrl(): string {
  const url =
    (import.meta.env.VITE_API_URL as string | undefined) ??
    window.SINALIZA_CONFIG?.apiUrl ??
    'http://localhost:8080/api';
  return url.replace(/\/+$/, '');
}

/** Session ends after 30 minutes without activity (RNF25), with a warning 1 minute before. */
export const INACTIVITY_LIMIT_MS = 30 * 60_000;
export const INACTIVITY_WARNING_MS = 60_000;
