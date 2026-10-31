import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Call } from '../test/utils';
import { GESTOR, mockApi, occurrence, renderAt, signIn } from '../test/utils';

vi.mock('../map/BaseMap', () => ({ BaseMap: () => null, pinIcon: () => undefined }));

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  reference: 'SIN-2026-00480',
  status: 'RECEBIDA',
  category: { id: 'c1', name: 'Iluminação pública', slug: 'iluminacao-publica' },
  address: 'Rua Direita, Barcelos',
  lat: 41.53,
  lng: -8.62,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  daysOpen: 11,
};

function listApi() {
  return mockApi(({ path }) => {
    if (path === '/categories')
      return {
        body: [
          {
            id: 'c1',
            slug: 'iluminacao-publica',
            name: 'Iluminação pública',
            icon: 'lightbulb',
            active: true,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };
    if (path === '/occurrences') return { body: { items: [ROW], total: 1, page: 1, pageSize: 20 } };
    return undefined;
  });
}

const lastList = (calls: Call[]) => calls.filter((c) => c.path === '/occurrences').at(-1);

describe('occurrence list', () => {
  it('reads the filters from the URL and sends them to the API', async () => {
    const calls = listApi();
    signIn(GESTOR);
    renderAt('/ocorrencias?q=Rua&status=RECEBIDA,EM_ANALISE&category=iluminacao-publica&page=2');

    expect(await screen.findByRole('link', { name: 'SIN-2026-00480' })).toHaveAttribute(
      'href',
      `/ocorrencias/${ROW.id}`,
    );
    const query = lastList(calls)?.query;
    expect(query?.get('q')).toBe('Rua');
    expect(query?.get('status')).toBe('RECEBIDA,EM_ANALISE');
    expect(query?.get('category')).toBe('iluminacao-publica');
    expect(query?.get('page')).toBe('2');
    expect(screen.getByRole('button', { name: 'Recebida' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Pesquisar')).toHaveValue('Rua');
  });

  it('writes filter and sort changes to the URL and goes back to page 1', async () => {
    const calls = listApi();
    signIn(GESTOR);
    const router = renderAt('/ocorrencias?page=3');
    const user = userEvent.setup();
    await screen.findByRole('link', { name: 'SIN-2026-00480' });

    await user.click(screen.getByRole('button', { name: 'Em Resolução' }));
    expect(router.state.location.search).toBe('?status=EM_RESOLUCAO');
    await waitFor(() => expect(lastList(calls)?.query.get('status')).toBe('EM_RESOLUCAO'));

    await user.click(screen.getByRole('button', { name: /Referência/ }));
    expect(new URLSearchParams(router.state.location.search).get('sort')).toBe('reference');
    const header = screen.getByRole('columnheader', { name: /Referência/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending');

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(router.state.location.search).toBe('?sort=reference');
  });

  it('shows days open and the status label in each row', async () => {
    listApi();
    signIn(GESTOR);
    renderAt('/ocorrencias');
    const row = (await screen.findByRole('link', { name: 'SIN-2026-00480' })).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText('Recebida')).toBeInTheDocument();
    expect(cells.getByText('11')).toBeInTheDocument();
  });
});

describe('occurrence detail', () => {
  it('shows only the actions allowed for the current status', async () => {
    mockApi(({ path }) => (path.startsWith('/occurrences/') ? { body: occurrence() } : undefined));
    signIn(GESTOR);
    renderAt(`/ocorrencias/${ROW.id}`);
    await screen.findByRole('heading', { name: 'SIN-2026-00480' });

    expect(screen.getByRole('button', { name: 'Validar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar como duplicada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar resolução' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como resolvida' })).not.toBeInTheDocument();
  });

  it('offers no status actions on a closed occurrence', async () => {
    mockApi(({ path }) =>
      path.startsWith('/occurrences/')
        ? { body: occurrence({ status: 'RESOLVIDA', allowedTransitions: [] }) }
        : undefined,
    );
    signIn(GESTOR);
    renderAt(`/ocorrencias/${ROW.id}`);
    await screen.findByRole('heading', { name: 'SIN-2026-00480' });
    expect(screen.queryByRole('button', { name: 'Validar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejeitar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alterar categoria' })).toBeInTheDocument();
  });

  it('requires a reason of at least 10 characters to reject', async () => {
    const calls = mockApi(({ method, path, body }) => {
      if (method === 'POST' && path.endsWith('/status')) {
        const { reason } = body as { reason: string };
        return {
          body: occurrence({
            status: 'REJEITADA',
            rejectionReason: reason,
            allowedTransitions: [],
          }),
        };
      }
      if (path.startsWith('/occurrences/')) return { body: occurrence() };
      return undefined;
    });
    signIn(GESTOR);
    renderAt(`/ocorrencias/${ROW.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Rejeitar' }));

    const dialog = screen.getByRole('dialog', { name: 'Rejeitar ocorrência' });
    const reason = within(dialog).getByLabelText('Fundamentação (obrigatória)');
    await user.type(reason, 'Curto');
    await user.click(within(dialog).getByRole('button', { name: 'Rejeitar' }));
    expect(
      within(dialog).getByText('Indique a fundamentação (pelo menos 10 caracteres).'),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith('/status'))).toBe(false);

    await user.type(reason, ' — fora da competência do município');
    await user.click(within(dialog).getByRole('button', { name: 'Rejeitar' }));
    expect(await screen.findByText(/estado alterado para «Rejeitada»/)).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('/status'))?.body).toEqual({
      status: 'REJEITADA',
      reason: 'Curto — fora da competência do município',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends the optional note only when one is written', async () => {
    const calls = mockApi(({ method, path }) => {
      if (method === 'POST' && path.endsWith('/status'))
        return { body: occurrence({ status: 'EM_RESOLUCAO', allowedTransitions: [] }) };
      if (path.startsWith('/occurrences/'))
        return {
          body: occurrence({
            status: 'EM_ANALISE',
            allowedTransitions: ['EM_RESOLUCAO', 'REJEITADA'],
          }),
        };
      return undefined;
    });
    signIn(GESTOR);
    renderAt(`/ocorrencias/${ROW.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Iniciar resolução' }));
    const dialog = screen.getByRole('dialog', { name: 'Iniciar resolução' });
    await user.click(within(dialog).getByRole('button', { name: 'Iniciar resolução' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith('/status'))?.body).toEqual({
        status: 'EM_RESOLUCAO',
      }),
    );
  });

  it('shows the API error inside the dialog when the change fails', async () => {
    mockApi(({ method, path }) => {
      if (method === 'POST' && path.endsWith('/status'))
        return { status: 409, body: { message: 'A ocorrência foi alterada entretanto.' } };
      if (path.startsWith('/occurrences/')) return { body: occurrence() };
      return undefined;
    });
    signIn(GESTOR);
    renderAt(`/ocorrencias/${ROW.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Validar' }));
    const dialog = screen.getByRole('dialog', { name: 'Validar ocorrência' });
    await user.click(within(dialog).getByRole('button', { name: 'Validar' }));
    expect(
      await within(dialog).findByText('A ocorrência foi alterada entretanto.'),
    ).toBeInTheDocument();
  });
});
