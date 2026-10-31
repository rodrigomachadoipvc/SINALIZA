import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CITIZEN_DENIED } from '../auth/auth';
import { sessionStore } from '../auth/session-store';
import { ADMIN, GESTOR, mockApi, renderAt, signIn } from '../test/utils';

vi.mock('../map/BaseMap', () => ({ BaseMap: () => null, pinIcon: () => undefined }));

const EMPTY_DASHBOARD = {
  source: 'postgres',
  updatedAt: '2026-10-31T10:00:00.000Z',
  period: { from: '2026-01-01', to: '2026-10-31' },
  totals: {
    total: 0,
    open: 0,
    resolvedInPeriod: 0,
    avgResolutionDays: null,
    rejectionRate: 0,
    duplicateRate: 0,
  },
  byStatus: [],
  byCategory: [],
  monthlyTrend: [],
  resolutionByCategory: [],
  hotspots: [],
};

async function submitLogin(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Palavra-passe'), 'Segredo123');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('login', () => {
  it('refuses citizens and revokes the tokens they were given', async () => {
    const calls = mockApi(({ path }) => {
      if (path === '/auth/login')
        return {
          body: {
            accessToken: 'a',
            refreshToken: 'r',
            expiresIn: 900,
            user: { ...GESTOR, role: 'CIDADAO' },
          },
        };
      if (path === '/auth/logout') return { status: 204 };
      return undefined;
    });
    renderAt('/login');
    await submitLogin('maria@example.com');

    expect(await screen.findByText(CITIZEN_DENIED)).toBeInTheDocument();
    expect(sessionStore.get()).toBeNull();
    const logout = calls.find((c) => c.path === '/auth/logout');
    expect(logout?.body).toEqual({ refreshToken: 'r' });
  });

  it('signs a gestor in and opens the dashboard', async () => {
    mockApi(({ path }) => {
      if (path === '/auth/login')
        return { body: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: GESTOR } };
      if (path === '/stats/dashboard') return { body: EMPTY_DASHBOARD };
      return undefined;
    });
    renderAt('/login');
    await submitLogin('gestor@sinaliza.pt');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('Base de dados operacional')).toBeInTheDocument();
    expect(screen.getByText('Gestor municipal')).toBeInTheDocument();
  });

  it('sends visitors without a session to the login page', async () => {
    mockApi(() => undefined);
    renderAt('/ocorrencias');
    expect(await screen.findByRole('heading', { name: 'Iniciar sessão' })).toBeInTheDocument();
  });
});

describe('after «Terminar sessão»', () => {
  it('starts the next person on the dashboard, not on the previous page', async () => {
    mockApi(({ path }) => {
      if (path === '/users/me') return { body: ADMIN };
      if (path === '/auth/logout') return { status: 204 };
      if (path === '/auth/login')
        return { body: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: GESTOR } };
      if (path === '/stats/dashboard') return { body: EMPTY_DASHBOARD };
      return undefined;
    });
    signIn(ADMIN);
    const router = renderAt('/perfil');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Terminar sessão' }));
    await screen.findByRole('heading', { name: 'Iniciar sessão' });
    await submitLogin('gestor@sinaliza.pt');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('navigation by role', () => {
  it('hides the admin pages from a gestor, also when typed in the address bar', async () => {
    mockApi(() => undefined);
    signIn(GESTOR);
    renderAt('/categorias');
    expect(await screen.findByText('Página não encontrada')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(nav).not.toHaveTextContent('Categorias');
    expect(nav).not.toHaveTextContent('Gestores municipais');
  });

  it('shows the admin pages to an admin', async () => {
    mockApi(({ path }) => (path === '/categories' ? { body: [] } : undefined));
    signIn(ADMIN);
    renderAt('/categorias');
    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(nav).toHaveTextContent('Gestores municipais');
  });

  it('ends the session on «Terminar sessão»', async () => {
    const calls = mockApi(({ path }) => {
      if (path === '/stats/dashboard') return { body: EMPTY_DASHBOARD };
      if (path === '/auth/logout') return { status: 204 };
      return undefined;
    });
    signIn(GESTOR);
    renderAt('/');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Terminar sessão' }));
    await waitFor(() => expect(sessionStore.get()).toBeNull());
    expect(calls.some((c) => c.path === '/auth/logout')).toBe(true);
    expect(await screen.findByRole('heading', { name: 'Iniciar sessão' })).toBeInTheDocument();
  });
});
