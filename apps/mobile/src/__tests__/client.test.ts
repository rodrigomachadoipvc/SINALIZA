import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { ApiError, get, http, toApiError } from '../api/client';
import type { User } from '../api/types';
import { useSession } from '../auth/session';
import { t } from '../i18n/pt-PT';

const USER: User = {
  id: 'u1',
  name: 'Maria Fernandes',
  email: 'maria@verificar.sinaliza.test',
  phone: null,
  role: 'CIDADAO',
  active: true,
  createdAt: '2026-01-10T10:00:00Z',
  lastLoginAt: null,
};

function axiosError(status: number, data: unknown = {}): AxiosError {
  const config = { headers: new axios.AxiosHeaders() } as InternalAxiosRequestConfig;
  const response = { status, data, config, headers: {}, statusText: '' } as AxiosResponse;
  return new AxiosError('failed', String(status), config, undefined, response);
}

describe('toApiError', () => {
  it('maps network failures, 429 and 5xx to fixed messages', () => {
    const network = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(toApiError(network).message).toBe(t.erros.rede);
    expect(toApiError(axiosError(429)).message).toBe(t.erros.demasiadosPedidos);
    expect(toApiError(axiosError(503)).message).toBe(t.erros.servidor);
    expect(toApiError(axiosError(403)).message).toBe(t.erros.semPermissao);
  });

  it('keeps the API message and the field errors of a 4xx', () => {
    const error = toApiError(
      axiosError(400, {
        message: 'Dados inválidos.',
        details: [{ field: 'phone', messages: ['Indique um telemóvel válido.'] }],
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Dados inválidos.');
    expect(error.fields).toEqual({ phone: 'Indique um telemóvel válido.' });
  });
});

describe('refresh interceptor', () => {
  const adapter = jest.fn<Promise<AxiosResponse>, [InternalAxiosRequestConfig]>();

  beforeEach(async () => {
    http.defaults.adapter = adapter;
    adapter.mockReset();
    await useSession.getState().signIn({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresIn: 900,
      user: USER,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const ok = (config: InternalAxiosRequestConfig, data: unknown): AxiosResponse => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });

  it('renews the token once for concurrent 401s and retries the requests', async () => {
    adapter.mockImplementation((config) => {
      const auth = config.headers.get('Authorization');
      if (auth === 'Bearer new-access') return Promise.resolve(ok(config, { ok: true }));
      return Promise.reject(axiosError(401));
    });
    const refresh = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900, user: USER },
    });

    const results = await Promise.all([get('/a'), get('/b')]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(useSession.getState().session).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  it('signs out with a clear message when the refresh token is no longer valid', async () => {
    adapter.mockRejectedValue(axiosError(401));
    jest.spyOn(axios, 'post').mockRejectedValue(axiosError(401));

    await expect(get('/a')).rejects.toThrow(t.erros.sessaoExpirada);
    expect(useSession.getState().status).toBe('signedOut');
  });
});
