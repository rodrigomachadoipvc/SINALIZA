import type { User } from '../api/types';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

/** Why the last session ended; the login page explains it to the user. */
export type EndReason = 'logout' | 'expired' | 'inactive';

const KEY = 'sinaliza.session';

function load(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let current: Session | null = load();
let endReason: EndReason | null = null;
const listeners = new Set<() => void>();

/**
 * The signed-in session, kept in sessionStorage so a reload keeps it but closing the tab ends it.
 * Plain module state (not React) because the API client needs the tokens too. `get` and
 * `subscribe` are arrow functions so they can be passed to useSyncExternalStore unbound.
 */
export const sessionStore = {
  get: (): Session | null => {
    return current;
  },
  set(session: Session | null, reason: EndReason = 'logout'): void {
    current = session;
    endReason = session ? null : reason;
    try {
      if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
      else sessionStorage.removeItem(KEY);
    } catch {
      // Storage unavailable (private mode): the session lives in memory only.
    }
    listeners.forEach((l) => l());
  },
  updateUser(user: User): void {
    if (current) sessionStore.set({ ...current, user });
  },
  /** Returns the reason the last session ended, once. */
  takeEndReason(): EndReason | null {
    const reason = endReason;
    endReason = null;
    return reason;
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
