import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { type AuthUser, JwtSigner } from '@sinaliza/service-kit';
import { UserRole } from '@sinaliza/shared';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { type GatewayConfig, SERVICE_NAMES, type ServiceName } from '../src/config.js';

/** What a stand-in service saw: the gateway's request after rewriting. */
export interface Echo {
  service: ServiceName;
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  bodyBytes: number;
}

export const USERS = {
  cidadao: { id: randomUUID(), role: UserRole.CIDADAO, email: 'c@email.pt', name: 'João Łukasz' },
  gestor: { id: randomUUID(), role: UserRole.GESTOR, email: 'g@sinaliza.pt', name: 'Gestor' },
  admin: { id: randomUUID(), role: UserRole.ADMIN, email: 'a@sinaliza.pt', name: 'Admin' },
} satisfies Record<string, AuthUser>;

type UserName = keyof typeof USERS;

/**
 * Each stand-in answers `GET /health`, `GET /docs/openapi.json` (a tiny spec), hangs on
 * `/slow` and echoes every other request as JSON.
 */
function stubService(service: ServiceName): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
      return;
    }
    if (req.url === '/docs/openapi.json') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          openapi: '3.0.0',
          info: { title: service, version: '1' },
          paths: {
            '/health': { get: { responses: {} } },
            '/categories': { get: { responses: {} }, post: { responses: {} } },
            '/internal/categories/{id}': { get: { responses: {} } },
          },
        }),
      );
      return;
    }
    if (req.url?.includes('slow')) return; // never answers: tests the proxy timeout
    let bodyBytes = 0;
    req.on('data', (chunk: Buffer) => (bodyBytes += chunk.length));
    req.on('end', () => {
      const echo: Echo = {
        service,
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        bodyBytes,
      };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(echo));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export interface Harness {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  auth: (user: UserName) => { Authorization: string };
  /** A token signed with a key the gateway does not trust. */
  forgedToken: string;
  stop: () => Promise<void>;
}

export async function startHarness(overrides: Partial<GatewayConfig> = {}): Promise<Harness> {
  const servers = await Promise.all(SERVICE_NAMES.map(stubService));
  const url = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  const services = Object.fromEntries(
    SERVICE_NAMES.map((name, i) => [name, url(servers[i] as Server)]),
  ) as Record<ServiceName, string>;

  const pair = () =>
    generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
  const keys = pair();
  const signer = await JwtSigner.fromPem(keys.privateKey, '15m');
  const tokens = {} as Record<UserName, string>;
  for (const [name, user] of Object.entries(USERS)) {
    tokens[name as UserName] = await signer.sign(user);
  }
  const forgedToken = await (await JwtSigner.fromPem(pair().privateKey, '15m')).sign(USERS.admin);

  const config: GatewayConfig = {
    port: 0,
    jwtPublicKeyPem: keys.publicKey,
    services,
    corsOrigins: ['http://localhost:5173'],
    rateLimitPerMinute: 1000,
    trustProxy: false,
    proxyTimeoutMs: 1000,
    ...overrides,
  };

  const app = await createApp(config, ['error']);
  await app.init();

  return {
    app,
    http: () => request(app.getHttpServer()),
    auth: (user) => ({ Authorization: `Bearer ${tokens[user]}` }),
    forgedToken,
    stop: async () => {
      await app.close();
      await Promise.all(
        servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
      );
    },
  };
}
