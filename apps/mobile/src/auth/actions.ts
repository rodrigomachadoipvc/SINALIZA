import axios from 'axios';

import { ApiError, post } from '../api/client';
import type { Tokens, User } from '../api/types';
import { API_URL } from '../config';
import { t } from '../i18n/pt-PT';
import { useSession } from './session';

/** Revokes the refresh token; failures are ignored because the local session ends anyway. */
async function revoke(accessToken: string, refreshToken: string): Promise<void> {
  await axios
    .post(
      `${API_URL}/auth/logout`,
      { refreshToken },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    .catch(() => undefined);
}

/** Signs in a citizen. Staff accounts are refused here: they use the backoffice. */
export async function signIn(email: string, password: string): Promise<void> {
  const tokens = await post<Tokens>('/auth/login', { email, password }, true);
  if (tokens.user.role !== 'CIDADAO') {
    await revoke(tokens.accessToken, tokens.refreshToken);
    throw new ApiError(403, t.login.soCidadaos);
  }
  await useSession.getState().signIn(tokens);
}

export function register(body: { name: string; email: string; password: string }): Promise<User> {
  return post<User>('/auth/register', body, true);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await post<unknown>('/auth/forgot-password', { email }, true);
}

/** D3 · Ends the session on the server and on the phone. */
export async function signOut(): Promise<void> {
  const session = useSession.getState().session;
  if (session) await revoke(session.accessToken, session.refreshToken);
  await useSession.getState().signOut();
}
