import 'reflect-metadata';

import { generateKeyPairSync } from 'node:crypto';

import { Controller, Get, HttpStatus, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@sinaliza/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CurrentUser, Public, Roles } from '../auth/decorators.js';
import { JwtSigner, JwtVerifier } from '../auth/jwt.js';
import { configureApp, coreProviders } from '../bootstrap.js';
import type { AuthUser } from '../http/request-context.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

@Controller()
class ProbeController {
  @Public()
  @Get('public')
  open(): { ok: true } {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Roles(UserRole.GESTOR)
  @Get('staff')
  staff(): { ok: true } {
    return { ok: true };
  }

  @Roles(UserRole.ADMIN)
  @Get('admin')
  admin(): { ok: true } {
    return { ok: true };
  }
}

const users: Record<UserRole, AuthUser> = {
  CIDADAO: { id: 'u-cid', role: UserRole.CIDADAO, email: 'c@x.pt', name: 'Cidadã' },
  GESTOR: { id: 'u-ges', role: UserRole.GESTOR, email: 'g@x.pt', name: 'Gestor' },
  ADMIN: { id: 'u-adm', role: UserRole.ADMIN, email: 'a@x.pt', name: 'Admin' },
};

describe('AuthGuard (RBAC)', () => {
  let app: INestApplication;
  const tokens = {} as Record<UserRole, string>;

  beforeAll(async () => {
    const signer = await JwtSigner.fromPem(privateKey, '15m');
    for (const role of Object.values(UserRole)) tokens[role] = await signer.sign(users[role]);

    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: coreProviders(await JwtVerifier.fromPem(publicKey)),
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { title: 'probe', description: 'probe' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, role?: UserRole) => {
    const req = request(app.getHttpServer()).get(path);
    return role ? req.set('Authorization', `Bearer ${tokens[role]}`) : req;
  };

  it('lets anyone reach public routes', async () => {
    await get('/public').expect(200);
  });

  it('returns 401 in the standard error format without a token', async () => {
    const res = await get('/me').set('x-request-id', 'req-123').expect(401);
    expect(res.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Precisa de iniciar sessão para continuar.',
      requestId: 'req-123',
    });
  });

  it('rejects a token signed with another key', async () => {
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const forged = await (await JwtSigner.fromPem(other.privateKey, '15m')).sign(users.ADMIN);
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('rejects an expired token', async () => {
    const expired = await (await JwtSigner.fromPem(privateKey, '-1s')).sign(users.ADMIN);
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });

  it('rejects a forwarded x-user-id that does not match the token', async () => {
    await get('/me', UserRole.CIDADAO).set('x-user-id', 'someone-else').expect(401);
  });

  it('exposes the user from the token', async () => {
    const res = await get('/me', UserRole.CIDADAO).expect(200);
    expect(res.body).toEqual(users.CIDADAO);
  });

  it.each([
    ['/staff', UserRole.CIDADAO, HttpStatus.FORBIDDEN],
    ['/staff', UserRole.GESTOR, HttpStatus.OK],
    ['/staff', UserRole.ADMIN, HttpStatus.OK],
    ['/admin', UserRole.CIDADAO, HttpStatus.FORBIDDEN],
    ['/admin', UserRole.GESTOR, HttpStatus.FORBIDDEN],
    ['/admin', UserRole.ADMIN, HttpStatus.OK],
  ] as const)('%s as %s → %i', async (path, role, status) => {
    await get(path, role).expect(status);
  });

  it('returns a PT-PT 404 for unknown routes', async () => {
    const res = await get('/nope', UserRole.ADMIN).expect(404);
    expect(res.body.message).toBe('O recurso pedido não existe.');
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });
});
