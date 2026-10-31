import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../api/client';
import type { Category, OccurrenceDetail } from '../api/types';
import Login from '../app/(auth)/login';
import OccurrenceDetailScreen from '../app/(tabs)/minhas/[id]';
import CategoryStep from '../app/reportar/categoria';
import { signIn } from '../auth/actions';
import { SnackbarProvider } from '../components/Snackbar';
import { t } from '../i18n/pt-PT';
import { useDraft } from '../store/draft';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() };

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: 'o1' }),
  useNavigation: () => ({ getState: () => ({ index: 1 }), getParent: () => undefined }),
}));

jest.mock('../auth/actions', () => ({ signIn: jest.fn() }));

const MOCK_CATEGORIES: Category[] = [
  { id: 'c1', slug: 'iluminacao', name: 'Iluminação pública', icon: 'lightbulb', active: true },
  { id: 'c2', slug: 'vias', name: 'Vias e pavimento', icon: 'construction', active: true },
];

const DETAIL: OccurrenceDetail = {
  id: 'o1',
  reference: 'SIN-2026-00042',
  status: 'RECEBIDA',
  category: { id: 'c1', name: 'Iluminação pública', slug: 'iluminacao' },
  description: 'Candeeiro apagado junto à passadeira.',
  address: 'Rua Direita, Barcelos',
  photoUrl: null,
  createdAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-30T10:00:00Z',
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
      changedAt: '2026-10-30T10:00:00Z',
    },
  ],
  allowedTransitions: ['ANULADA'],
};

const mockCancel = jest.fn();
let mockDetail: OccurrenceDetail = DETAIL;

jest.mock('../api/queries', () => ({
  useCategories: () => ({ data: MOCK_CATEGORIES, isPending: false, isError: false }),
  useOccurrence: () => ({ data: mockDetail, isPending: false, isError: false }),
  useCancelOccurrence: () => ({ mutate: mockCancel, isPending: false, isError: false }),
}));

// The map is a native view; its own behaviour is checked in the app, not here.
jest.mock('../map/SinalizaMap', () => ({ SinalizaMap: () => null }));

beforeEach(() => jest.clearAllMocks());

describe('Login (A02–A04)', () => {
  it('on a 401 shows the notice and marks and focuses the password field', async () => {
    jest.mocked(signIn).mockRejectedValue(new ApiError(401, 'Unauthorized'));
    await render(<Login />);

    await fireEvent.changeText(
      screen.getByLabelText(t.login.email),
      'maria@verificar.sinaliza.test',
    );
    await fireEvent.changeText(screen.getByLabelText(t.login.palavraPasse), 'Errada12345');
    await fireEvent.press(screen.getByRole('button', { name: t.login.entrar }));

    expect(await screen.findByText(t.login.erro401)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.login.palavraPasse)).toHaveProp('aria-invalid', true);
    expect(signIn).toHaveBeenCalledWith('maria@verificar.sinaliza.test', 'Errada12345');
  });

  it('shows the field messages without calling the API', async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByRole('button', { name: t.login.entrar }));

    expect(await screen.findByText(t.validacao.email)).toBeOnTheScreen();
    expect(screen.getByText(t.validacao.palavraPasseObrigatoria)).toBeOnTheScreen();
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('Report step 2', () => {
  it('lists what is missing, then saves the draft and moves on', async () => {
    await render(<CategoryStep />);

    await fireEvent.press(screen.getByRole('button', { name: t.comum.continuar }));
    expect(screen.getByText(t.comum.obrigatorioCorrigir)).toBeOnTheScreen();
    expect(screen.getByText(t.validacao.categoria)).toBeOnTheScreen();
    expect(screen.getByText(t.validacao.descricaoCurta)).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('radio', { name: 'Vias e pavimento' }));
    await fireEvent.changeText(
      screen.getByLabelText(t.assistente.categoria.descricao),
      'Buraco grande na estrada.',
    );
    await fireEvent.press(screen.getByRole('button', { name: t.comum.continuar }));

    expect(useDraft.getState()).toMatchObject({
      categoryId: 'c2',
      description: 'Buraco grande na estrada.',
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/reportar/localizacao');
  });
});

describe('Occurrence detail (B03/B04)', () => {
  const renderDetail = () =>
    render(
      <SnackbarProvider>
        <OccurrenceDetailScreen />
      </SnackbarProvider>,
    );

  it('asks for confirmation (D2) before cancelling a received occurrence', async () => {
    mockDetail = DETAIL;
    await renderDetail();

    await fireEvent.press(screen.getByRole('button', { name: t.detalhe.anular }));
    expect(screen.getByText(t.detalhe.anularTitulo)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t.detalhe.anularConfirmar }));

    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it('explains why cancelling is not possible after the analysis started', async () => {
    mockDetail = { ...DETAIL, status: 'EM_ANALISE', allowedTransitions: [] };
    await renderDetail();

    expect(screen.getByRole('button', { name: t.detalhe.anular })).toBeDisabled();
    expect(screen.getByText(t.detalhe.naoPodeAnular)).toBeOnTheScreen();
  });
});
