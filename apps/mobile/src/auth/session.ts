import { create } from 'zustand';

import type { Tokens, User } from '../api/types';
import { tokenStorage } from './token-storage';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

type Status = 'loading' | 'signedIn' | 'signedOut';

interface SessionState {
  status: Status;
  session: StoredSession | null;
  /** Reads the saved session on start-up (A01). */
  restore: () => Promise<void>;
  signIn: (tokens: Tokens) => Promise<void>;
  /** After a refresh: new tokens, same user. */
  replaceTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    typeof v.user === 'object' &&
    v.user !== null
  );
}

/** The signed-in session. Plain store (not React context) because the API client needs it too. */
export const useSession = create<SessionState>()((set, get) => {
  const save = async (session: StoredSession) => {
    set({ status: 'signedIn', session });
    await tokenStorage.write(JSON.stringify(session));
  };
  return {
    status: 'loading',
    session: null,
    restore: async () => {
      try {
        const raw = await tokenStorage.read();
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (isStoredSession(parsed)) set({ status: 'signedIn', session: parsed });
        else set({ status: 'signedOut', session: null });
      } catch {
        set({ status: 'signedOut', session: null });
      }
    },
    signIn: ({ accessToken, refreshToken, user }) => save({ accessToken, refreshToken, user }),
    replaceTokens: async (accessToken, refreshToken) => {
      const current = get().session;
      if (current) await save({ ...current, accessToken, refreshToken });
    },
    updateUser: async (user) => {
      const current = get().session;
      if (current) await save({ ...current, user });
    },
    signOut: async () => {
      set({ status: 'signedOut', session: null });
      await tokenStorage.clear();
    },
  };
});
