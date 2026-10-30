import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import { type AuthUser, INTERNAL_TOKEN_HEADER, JwtSigner, repoRoot } from '@sinaliza/service-kit';
import { type AnyEvent, EVENTS_EXCHANGE, type EventType, UserRole } from '@sinaliza/shared';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import amqp from 'amqplib';
import pg from 'pg';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { createApp } from '../src/app.js';
import type { OccurrenceConfig } from '../src/config.js';
import { BoundaryService } from '../src/integrations/boundary.service.js';

export const INTERNAL_TOKEN = 'test-internal-token';
const S3_KEY = 'testaccesskey';
const S3_SECRET = 'testsecretkey123';
const BUCKET = 'occurrence-photos';

/** Points used by the tests (the same ones the municipal-service tests check). */
export const PLACES = {
  camara: { lat: 41.5317, lng: -8.6194 },
  barcelinhos: { lat: 41.5292, lng: -8.6232 },
  braga: { lat: 41.5454, lng: -8.4265 },
} as const;

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  active: boolean;
}

export const CATEGORIES = {
  vias: {
    id: randomUUID(),
    slug: 'vias',
    name: 'Vias e pavimento',
    icon: 'construction',
    active: true,
  },
  iluminacao: {
    id: randomUUID(),
    slug: 'iluminacao',
    name: 'Iluminação pública',
    icon: 'lightbulb',
    active: true,
  },
  antiga: { id: randomUUID(), slug: 'antiga', name: 'Antiga', icon: 'ellipsis', active: false },
} satisfies Record<string, Category>;

export const USERS = {
  maria: {
    id: randomUUID(),
    role: UserRole.CIDADAO,
    email: 'maria.fernandes@email.pt',
    name: 'Maria Fernandes',
  },
  joao: { id: randomUUID(), role: UserRole.CIDADAO, email: 'joao@email.pt', name: 'João Silva' },
  gestor: {
    id: randomUUID(),
    role: UserRole.GESTOR,
    email: 'gestor@sinaliza.pt',
    name: 'Gestor',
  },
  admin: { id: randomUUID(), role: UserRole.ADMIN, email: 'admin@sinaliza.pt', name: 'Admin' },
} satisfies Record<string, AuthUser>;

type UserName = keyof typeof USERS;

/** Stand-ins for the municipal-service internal API and Nominatim, on random local ports. */
export interface Stubs {
  municipalDown: boolean;
  nominatimDown: boolean;
  nominatimRequests: number;
}

export interface Harness {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  db: pg.Client;
  stubs: Stubs;
  auth: (user: UserName) => { Authorization: string };
  events: AnyEvent[];
  waitForEvent: <T extends EventType>(
    type: T,
    match?: (e: Extract<AnyEvent, { type: T }>) => boolean,
  ) => Promise<Extract<AnyEvent, { type: T }>>;
  stop: () => Promise<void>;
}

async function applyMigrations(client: pg.Client): Promise<void> {
  const dir = join(import.meta.dirname, '..', 'prisma', 'migrations');
  for (const name of readdirSync(dir)
    .filter((n) => /^\d+_/.test(n))
    .sort()) {
    await client.query(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
  }
}

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Server> {
  const server = createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const urlOf = (server: Server): string =>
  `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

async function startStubs(stubs: Stubs): Promise<[Server, Server]> {
  const geojson = JSON.parse(
    readFileSync(join(repoRoot(), 'infra', 'geo', 'barcelos.geojson'), 'utf8'),
  ) as { features: Array<{ geometry: unknown }> };
  const boundary = geojson.features[0]?.geometry;
  const byId = new Map<string, Category>(Object.values(CATEGORIES).map((c) => [c.id, c]));

  const municipal = await listen((req, res) => {
    if (stubs.municipalDown) return json(res, 503, { message: 'down' });
    if (req.headers[INTERNAL_TOKEN_HEADER] !== INTERNAL_TOKEN) return json(res, 401, {});
    if (req.url === '/internal/municipality') {
      return json(res, 200, { name: 'Barcelos', boundary });
    }
    const match = /^\/internal\/categories\/([^/]+)$/.exec(req.url ?? '');
    const category = match ? byId.get(decodeURIComponent(match[1] ?? '')) : undefined;
    return category ? json(res, 200, category) : json(res, 404, { message: 'not found' });
  });

  const nominatim = await listen((req, res) => {
    stubs.nominatimRequests++;
    if (stubs.nominatimDown) return json(res, 500, {});
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/reverse' || !req.headers['user-agent']?.startsWith('Sinaliza/')) {
      return json(res, 400, {});
    }
    return json(res, 200, {
      display_name: 'Largo do Município, Barcelos, Braga, Portugal',
      address: { road: 'Largo do Município', house_number: '1', city: 'Barcelos' },
    });
  });
  return [municipal, nominatim];
}

/**
 * Starts PostGIS, RabbitMQ and RustFS containers plus local stubs for the municipal-service and
 * Nominatim, applies the migrations and boots the real app.
 */
export async function startHarness(): Promise<Harness> {
  const [postgres, rabbit, storage]: [
    StartedPostgreSqlContainer,
    StartedRabbitMQContainer,
    StartedTestContainer,
  ] = await Promise.all([
    new PostgreSqlContainer('postgis/postgis:16-3.6-alpine').withDatabase('occurrence_db').start(),
    new RabbitMQContainer('rabbitmq:4.3-alpine').start(),
    new GenericContainer('rustfs/rustfs:1.0.3')
      .withEnvironment({
        RUSTFS_VOLUMES: '/data',
        RUSTFS_ADDRESS: '0.0.0.0:9000',
        RUSTFS_ACCESS_KEY: S3_KEY,
        RUSTFS_SECRET_KEY: S3_SECRET,
      })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
      .start(),
  ]);

  const db = new pg.Client({ connectionString: postgres.getConnectionUri() });
  await db.connect();
  await applyMigrations(db);

  const s3Endpoint = `http://${storage.getHost()}:${storage.getMappedPort(9000)}`;
  const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: S3_KEY, secretAccessKey: S3_SECRET },
  });
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  s3.destroy();

  const stubs: Stubs = { municipalDown: false, nominatimDown: false, nominatimRequests: 0 };
  const [municipal, nominatim] = await startStubs(stubs);

  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const signer = await JwtSigner.fromPem(keys.privateKey, '15m');
  const tokens = {} as Record<UserName, string>;
  for (const [name, user] of Object.entries(USERS)) {
    tokens[name as UserName] = await signer.sign(user);
  }

  const config: OccurrenceConfig = {
    port: 0,
    databaseUrl: postgres.getConnectionUri(),
    rabbitmqUrl: rabbit.getAmqpUrl(),
    jwtPublicKeyPem: keys.publicKey,
    internalToken: INTERNAL_TOKEN,
    municipalServiceUrl: urlOf(municipal),
    storage: {
      endpoint: s3Endpoint,
      publicEndpoint: s3Endpoint,
      region: 'us-east-1',
      accessKey: S3_KEY,
      secretKey: S3_SECRET,
      bucket: BUCKET,
    },
    photoUrlTtlSeconds: 900,
    nominatim: { url: urlOf(nominatim), userAgent: 'Sinaliza/test', timeoutMs: 2000 },
  };

  // Capture every event: a private queue bound to the exchange with `#`.
  const conn = await amqp.connect(config.rabbitmqUrl);
  const channel = await conn.createChannel();
  await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  const { queue } = await channel.assertQueue('', { exclusive: true });
  await channel.bindQueue(queue, EVENTS_EXCHANGE, '#');
  const events: AnyEvent[] = [];
  await channel.consume(
    queue,
    (msg) => {
      if (msg) events.push(JSON.parse(msg.content.toString()) as AnyEvent);
    },
    { noAck: true },
  );

  const { app } = await createApp(config, ['error']);
  await app.init();
  if (!(await app.get(BoundaryService).refresh())) throw new Error('boundary not cached');

  const waitForEvent: Harness['waitForEvent'] = async (type, match) => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const found = events.find(
        (e) => e.type === type && (!match || match(e as Extract<AnyEvent, { type: typeof type }>)),
      );
      if (found) return found as Extract<AnyEvent, { type: typeof type }>;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${type}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  return {
    app,
    http: () => request(app.getHttpServer()),
    db,
    stubs,
    auth: (user) => ({ Authorization: `Bearer ${tokens[user]}` }),
    events,
    waitForEvent,
    stop: async () => {
      await app.close();
      await channel.close().catch(() => undefined);
      await conn.close().catch(() => undefined);
      await db.end();
      municipal.close();
      nominatim.close();
      await Promise.all([postgres.stop(), rabbit.stop(), storage.stop()]);
    },
  };
}
