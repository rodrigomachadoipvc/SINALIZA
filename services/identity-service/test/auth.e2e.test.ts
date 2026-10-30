import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN, type Harness, MARIA, startHarness } from './harness.js';

describe('auth (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h?.stop();
  });

  describe('register', () => {
    it('creates a citizen with a lower-case email and publishes user.registered', async () => {
      const res = await h
        .http()
        .post('/auth/register')
        .send({ name: '  Rui Costa ', email: 'Rui.Costa@Email.PT', password: 'Rui12345' })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Rui Costa',
        email: 'rui.costa@email.pt',
        role: 'CIDADAO',
        active: true,
        phone: null,
      });
      expect(res.body).not.toHaveProperty('passwordHash');

      const event = await h.waitForEvent(
        'user.registered',
        (e) => e.payload.userId === res.body.id,
      );
      expect(event).toMatchObject({
        version: 1,
        payload: { name: 'Rui Costa', email: 'rui.costa@email.pt' },
      });
    });

    it('ignores any attempt to choose the role', async () => {
      const res = await h
        .http()
        .post('/auth/register')
        .send({ name: 'Intruso', email: 'intruso@email.pt', password: 'Abc12345', role: 'ADMIN' })
        .expect(400);
      expect(res.body.details).toContainEqual({
        field: 'role',
        messages: ['O campo «role» não é permitido.'],
      });
    });

    it('rejects a weak password with a PT-PT message', async () => {
      const res = await h
        .http()
        .post('/auth/register')
        .send({ name: 'Fraca', email: 'fraca@email.pt', password: 'abcdefgh' })
        .expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'Corrija os campos assinalados e tente novamente.',
        details: [{ field: 'password' }],
      });
      expect(typeof res.body.requestId).toBe('string');
    });

    it('returns 409 for an existing email in any case', async () => {
      const res = await h
        .http()
        .post('/auth/register')
        .send({ name: 'Outra Maria', email: 'MARIA.FERNANDES@email.pt', password: 'Maria12345' })
        .expect(409);
      expect(res.body.message).toBe('Já existe uma conta com este email.');
    });
  });

  describe('login', () => {
    it('returns tokens and the user', async () => {
      const res = await h.http().post('/auth/login').send(MARIA).expect(200);
      expect(res.body).toMatchObject({
        expiresIn: 900,
        user: { email: MARIA.email, role: 'CIDADAO' },
      });
      expect(res.body.accessToken.split('.')).toHaveLength(3);
      expect(res.body.user.lastLoginAt).not.toBeNull();

      await h
        .http()
        .get('/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const wrong = await h
        .http()
        .post('/auth/login')
        .send({ email: MARIA.email, password: 'Errada123' })
        .expect(401);
      const unknown = await h
        .http()
        .post('/auth/login')
        .send({ email: 'ninguem@email.pt', password: 'Errada123' })
        .expect(401);
      expect(wrong.body.message).toBe('Email ou palavra-passe incorretos.');
      expect(unknown.body.message).toBe(wrong.body.message);
    });
  });

  describe('refresh and logout', () => {
    it('rotates the refresh token and detects reuse', async () => {
      const first = await h.login(MARIA.email, MARIA.password);

      const rotated = await h
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toBe(first.refreshToken);

      // Reusing the old token means it leaked: it fails and revokes the whole family.
      await h.http().post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      await h
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await h.http().post('/auth/refresh').send({ refreshToken: 'nao-existe' }).expect(401);
    });

    it('revokes the refresh token on logout', async () => {
      const session = await h.login(MARIA.email, MARIA.password);
      await h
        .http()
        .post('/auth/logout')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ refreshToken: session.refreshToken })
        .expect(204);
      await h.http().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    });

    it('requires authentication to log out', async () => {
      await h.http().post('/auth/logout').send({ refreshToken: 'x' }).expect(401);
    });
  });

  describe('password recovery', () => {
    it('always answers 202, even for unknown emails, and sends no event for them', async () => {
      const before = h.events.length;
      const res = await h
        .http()
        .post('/auth/forgot-password')
        .send({ email: 'ninguem@email.pt' })
        .expect(202);
      expect(res.body.message).toMatch(/Se o email estiver registado/);
      await new Promise((r) => setTimeout(r, 300));
      expect(
        h.events.slice(before).filter((e) => e.type === 'user.password_reset_requested'),
      ).toHaveLength(0);
    });

    it('resets the password with the emailed link and ends existing sessions', async () => {
      const email = 'recuperar@email.pt';
      await h
        .http()
        .post('/auth/register')
        .send({ name: 'Recuperar', email, password: 'Antiga123' })
        .expect(201);
      const oldSession = await h.login(email, 'Antiga123');

      await h.http().post('/auth/forgot-password').send({ email }).expect(202);
      const event = await h.waitForEvent(
        'user.password_reset_requested',
        (e) => e.payload.email === email,
      );
      const url = new URL(event.payload.resetUrl);
      expect(url.pathname).toBe('/redefinir-palavra-passe');
      const token = url.searchParams.get('token') ?? '';
      const expiresIn = new Date(event.payload.expiresAt).getTime() - Date.now();
      expect(expiresIn).toBeGreaterThan(29 * 60_000);
      expect(expiresIn).toBeLessThanOrEqual(30 * 60_000);

      await h
        .http()
        .post('/auth/reset-password')
        .send({ token, newPassword: 'Nova12345' })
        .expect(204);

      // The link works once, the old password stops working and old sessions are revoked.
      const reused = await h
        .http()
        .post('/auth/reset-password')
        .send({ token, newPassword: 'Outra12345' })
        .expect(400);
      expect(reused.body.message).toMatch(/inválida ou expirou/);
      await h.http().post('/auth/login').send({ email, password: 'Antiga123' }).expect(401);
      await h.login(email, 'Nova12345');
      await h
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: oldSession.refreshToken })
        .expect(401);
    });

    it('rejects an invalid token', async () => {
      await h
        .http()
        .post('/auth/reset-password')
        .send({ token: 'invalido', newPassword: 'Nova12345' })
        .expect(400);
    });
  });

  it('serves the OpenAPI document', async () => {
    const res = await h.http().get('/docs/openapi.json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/auth/login', '/auth/register', '/users/me', '/users/gestores']),
    );
  });

  it('reports health', async () => {
    const res = await h.http().get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up', rabbitmq: 'up' } });
  });

  it('keeps ADMIN login working (seed)', async () => {
    const session = await h.login(ADMIN.email, ADMIN.password);
    expect(session.accessToken).toBeTruthy();
  });
});

describe('auth rate limit (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness({ authRateLimitPerMinute: 3 });
  });

  afterAll(async () => {
    await h?.stop();
  });

  it('returns 429 with a PT-PT message after too many login attempts', async () => {
    for (let i = 0; i < 3; i++) {
      await h
        .http()
        .post('/auth/login')
        .send({ email: MARIA.email, password: 'Errada123' })
        .expect(401);
    }
    const res = await h
      .http()
      .post('/auth/login')
      .send({ email: MARIA.email, password: 'Errada123' })
      .expect(429);
    expect(res.body.message).toBe('Demasiados pedidos. Aguarde um momento e tente novamente.');
  });
});
