import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';

import type { OccurrenceDetail, User } from '../api/types';
import { createQueryClient, Providers, routes } from '../App';
import { sessionStore } from '../auth/session-store';

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

type Handler = (call: Call) => { status?: number; body?: unknown } | undefined;

/**
 * Replaces fetch with `handler`; unhandled requests answer 404 so a missing stub shows up as an
 * error on screen instead of a hang. Returns every request made, for assertions.
 */
export function mockApi(handler: Handler): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input);
      const call: Call = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        query: url.searchParams,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const res = handler(call) ?? { status: 404, body: { message: `sem stub: ${call.path}` } };
      const status = res.status ?? 200;
      return Promise.resolve(
        new Response(status === 204 ? null : JSON.stringify(res.body ?? {}), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
  return calls;
}

export const GESTOR: User = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'João Gestor',
  email: 'gestor@sinaliza.pt',
  phone: null,
  role: 'GESTOR',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
};

export const ADMIN: User = {
  ...GESTOR,
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ana Admin',
  email: 'admin@sinaliza.pt',
  role: 'ADMIN',
};

export function signIn(user: User): void {
  sessionStore.set({ accessToken: 'access', refreshToken: 'refresh', user });
}

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  render(
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}

export function occurrence(overrides: Partial<OccurrenceDetail> = {}): OccurrenceDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    reference: 'SIN-2026-00480',
    status: 'RECEBIDA',
    category: { id: 'c1', name: 'Iluminação pública', slug: 'iluminacao-publica' },
    description: 'Candeeiro apagado há uma semana.',
    address: 'Rua Direita, Barcelos',
    photoUrl: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    lat: 41.53,
    lng: -8.62,
    rejectionReason: null,
    original: null,
    resolvedAt: null,
    cancelledAt: null,
    history: [
      {
        from: null,
        to: 'RECEBIDA',
        note: null,
        reason: null,
        changedByRole: 'CIDADAO',
        changedAt: '2026-10-20T10:00:00.000Z',
      },
    ],
    allowedTransitions: ['EM_ANALISE', 'REJEITADA', 'DUPLICADA'],
    citizen: { id: 'u9', name: 'Maria Fernandes', email: 'maria@example.com' },
    ...overrides,
  };
}
