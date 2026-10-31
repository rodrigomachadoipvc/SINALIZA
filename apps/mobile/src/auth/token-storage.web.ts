const KEY = 'sinaliza.session';

/**
 * The web build (used for development checks in a browser) has no secure store, so the session
 * stays in sessionStorage and ends when the tab closes.
 */
export const tokenStorage = {
  read(): Promise<string | null> {
    try {
      return Promise.resolve(sessionStorage.getItem(KEY));
    } catch {
      return Promise.resolve(null);
    }
  },
  write(value: string): Promise<void> {
    try {
      sessionStorage.setItem(KEY, value);
    } catch {
      // Storage unavailable: the session lives in memory only.
    }
    return Promise.resolve();
  },
  clear(): Promise<void> {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
    return Promise.resolve();
  },
};
