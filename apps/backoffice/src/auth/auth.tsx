import { isStaff } from '@sinaliza/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { api, ApiError } from '../api/client';
import type { Tokens, User } from '../api/types';
import { type EndReason, sessionStore } from './session-store';

export const CITIZEN_DENIED = 'Esta área é reservada a gestores municipais.';

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: (reason?: EndReason) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Best effort: the session ends locally even if the server cannot be reached. */
async function revoke(accessToken: string, refreshToken: string): Promise<void> {
  await api<void>('POST', '/auth/logout', { json: { refreshToken }, token: accessToken }).catch(
    () => undefined,
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
  const queryClient = useQueryClient();

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api<Tokens>('POST', '/auth/login', {
      json: { email, password },
      auth: false,
    });
    if (!isStaff(tokens.user.role)) {
      await revoke(tokens.accessToken, tokens.refreshToken);
      throw new ApiError(403, CITIZEN_DENIED);
    }
    sessionStore.set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    });
  }, []);

  const logout = useCallback(
    async (reason: EndReason = 'logout') => {
      const current = sessionStore.get();
      if (current) await revoke(current.accessToken, current.refreshToken);
      sessionStore.set(null, reason);
      queryClient.clear();
    },
    [queryClient],
  );

  const value = useMemo(
    () => ({ user: session?.user ?? null, login, logout }),
    [session, login, logout],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
