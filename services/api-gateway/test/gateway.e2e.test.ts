import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Echo, type Harness, startHarness, USERS } from './harness.js';

describe('api-gateway (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h?.stop();
  });

  describe('routing', () => {
    it('forwards public routes without a token, removing the /api prefix', async () => {
      const res = await h
        .http()
        .post('/api/auth/login?x=1')
        .send({ email: 'a@b.pt', password: 'x' })
        .expect(200);
      const echo = res.body as Echo;
      expect(echo).toMatchObject({ service: 'identity', method: 'POST', url: '/auth/login?x=1' });
      expect(echo.bodyBytes).toBeGreaterThan(0);
      expect(echo.headers['x-user-id']).toBeUndefined();
    });

    it('sends each prefix to its service', async () => {
      const cases: Array<[string, string]> = [
        ['/api/categories', 'municipal'],
        ['/api/municipality', 'municipal'],
        ['/api/map/occurrences?bbox=1,2,3,4', 'occurrence'],
        ['/api/users/me', 'identity'],
      ];
      for (const [path, service] of cases) {
        const res = await h.http().get(path).set(h.auth('cidadao')).expect(200);
        expect((res.body as Echo).service, path).toBe(service);
      }
    });

    it('never exposes internal routes, health checks or unknown paths', async () => {
      for (const path of [
        '/api/internal/municipality',
        '/api/health',
        '/api/nada',
        '/api',
        '/api/occurrences/a/b/c',
      ]) {
        const res = await h.http().get(path).set(h.auth('admin')).expect(404);
        expect(res.body).toMatchObject({
          statusCode: 404,
          message: 'O endereço pedido não existe.',
          requestId: expect.any(String),
        });
      }
    });

    it('answers 405 with the allowed methods', async () => {
      const res = await h.http().delete('/api/occurrences/123').set(h.auth('admin')).expect(405);
      expect(res.headers.allow).toBe('GET');
    });

    it('streams large bodies (photo uploads) untouched', async () => {
      const res = await h
        .http()
        .post('/api/photos')
        .set(h.auth('cidadao'))
        .attach('file', Buffer.alloc(3 * 1024 * 1024, 1), { filename: 'f.jpg' })
        .expect(200);
      const echo = res.body as Echo;
      expect(echo.bodyBytes).toBeGreaterThan(3 * 1024 * 1024);
      expect(echo.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    });
  });

  describe('authentication and RBAC', () => {
    it('requires a valid token on protected routes', async () => {
      const missing = await h.http().get('/api/categories').expect(401);
      expect(missing.body.message).toBe('Precisa de iniciar sessão para continuar.');
      await h.http().get('/api/categories').set('Authorization', 'Basic abc').expect(401);
      const forged = await h
        .http()
        .get('/api/categories')
        .set('Authorization', `Bearer ${h.forgedToken}`)
        .expect(401);
      expect(forged.body.message).toBe('Sessão inválida ou expirada. Inicie sessão novamente.');
    });

    it('checks the role of each route', async () => {
      await h.http().get('/api/occurrences').set(h.auth('cidadao')).expect(403);
      await h.http().get('/api/occurrences').set(h.auth('gestor')).expect(200);
      await h.http().get('/api/occurrences').set(h.auth('admin')).expect(200); // ADMIN ⊇ GESTOR
      await h.http().get('/api/users').set(h.auth('gestor')).expect(403);
      await h.http().get('/api/users').set(h.auth('admin')).expect(200);
      await h.http().post('/api/occurrences').set(h.auth('gestor')).expect(403);
      await h.http().get('/api/occurrences/mine').set(h.auth('cidadao')).expect(200);
      await h.http().get('/api/stats/dashboard').set(h.auth('cidadao')).expect(403);
      const res = await h.http().post('/api/categories').set(h.auth('gestor')).expect(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Não tem permissão para realizar esta ação.',
      });
    });

    it('replaces identity and forwarding headers sent by the client', async () => {
      const res = await h
        .http()
        .get('/api/users/me')
        .set(h.auth('cidadao'))
        .set('x-user-id', 'someone-else')
        .set('x-user-role', 'ADMIN')
        .set('x-internal-token', 'guess')
        .set('x-forwarded-for', '1.2.3.4')
        .set('x-request-id', 'trace-123')
        .expect(200);
      const { headers } = res.body as Echo;
      expect(headers['x-user-id']).toBe(USERS.cidadao.id);
      expect(headers['x-user-role']).toBe('CIDADAO');
      expect(headers['x-user-email']).toBe('c@email.pt');
      expect(decodeURIComponent(String(headers['x-user-name']))).toBe('João Łukasz');
      expect(headers['x-internal-token']).toBeUndefined();
      expect(headers['x-forwarded-for']).not.toContain('1.2.3.4');
      expect(headers['x-request-id']).toBe('trace-123');
      expect(headers.authorization).toBe(h.auth('cidadao').Authorization);
      expect(res.headers['x-request-id']).toBe('trace-123');
    });
  });

  describe('security headers and CORS', () => {
    it('adds helmet headers and a request id', async () => {
      const res = await h.http().get('/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('allows only the configured browser origins', async () => {
      const ok = await h
        .http()
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,authorization');
      expect(ok.status).toBe(204);
      expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(ok.headers['access-control-allow-headers']).toContain('authorization');

      const evil = await h
        .http()
        .options('/api/auth/login')
        .set('Origin', 'http://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('upstream failures', () => {
    it('answers 504 when a service does not respond in time', async () => {
      const res = await h.http().get('/api/occurrences/slow').set(h.auth('cidadao')).expect(504);
      expect(res.body.message).toBe('O serviço demorou demasiado a responder. Tente novamente.');
    });

    it('answers 503 when a service is down', async () => {
      // A port that was free a moment ago: nothing listens there.
      const free = createServer();
      await new Promise<void>((r) => free.listen(0, '127.0.0.1', r));
      const port = (free.address() as AddressInfo).port;
      await new Promise<void>((r) => free.close(() => r()));

      const down = await startHarness({
        services: {
          identity: `http://127.0.0.1:${port}`,
          municipal: `http://127.0.0.1:${port}`,
          occurrence: `http://127.0.0.1:${port}`,
          notification: `http://127.0.0.1:${port}`,
        },
      });
      try {
        const res = await down.http().get('/api/categories').set(down.auth('cidadao')).expect(503);
        expect(res.body).toMatchObject({
          statusCode: 503,
          message: 'O serviço está temporariamente indisponível. Tente novamente mais tarde.',
        });
        const health = await down.http().get('/health').expect(200);
        expect(health.body.services).toEqual({
          identity: 'down',
          municipal: 'down',
          occurrence: 'down',
          notification: 'down',
        });
      } finally {
        await down.stop();
      }
    });
  });

  describe('rate limit', () => {
    it('answers 429 after the limit per minute', async () => {
      const limited = await startHarness({ rateLimitPerMinute: 3 });
      try {
        for (let i = 0; i < 3; i++) await limited.http().post('/api/auth/login').expect(200);
        const res = await limited.http().post('/api/auth/login').expect(429);
        expect(res.body.message).toBe('Demasiados pedidos. Aguarde um momento e tente novamente.');
        expect(res.headers['ratelimit-policy']).toBeDefined();
        // The gateway's own pages are not limited.
        await limited.http().get('/health').expect(200);
      } finally {
        await limited.stop();
      }
    });
  });

  describe('docs', () => {
    it('serves Swagger UI with a selector for the four specs', async () => {
      const page = await h.http().get('/docs').expect(200);
      expect(page.text).toContain('/docs/assets/swagger-ui-bundle.js');
      const init = await h.http().get('/docs/init.js').expect(200);
      for (const name of ['identity', 'municipal', 'occurrence', 'notification']) {
        expect(init.text).toContain(`/docs/specs/${name}.json`);
      }
      await h.http().get('/docs/assets/swagger-ui-bundle.js').expect(200);
    });

    it('rewrites each spec for the gateway', async () => {
      const res = await h.http().get('/docs/specs/municipal.json').expect(200);
      expect(res.body.servers).toEqual([{ url: '/api', description: 'API Gateway' }]);
      expect(Object.keys(res.body.paths)).toEqual(['/categories']);
      await h.http().get('/docs/specs/other.json').expect(404);
    });

    it('reports the services in /health', async () => {
      const res = await h.http().get('/health').expect(200);
      expect(res.body).toEqual({
        status: 'ok',
        services: { identity: 'up', municipal: 'up', occurrence: 'up', notification: 'up' },
      });
    });
  });
});
