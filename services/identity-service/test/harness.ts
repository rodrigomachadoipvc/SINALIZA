import { generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { EVENTS_EXCHANGE, type AnyEvent, type EventType } from '@sinaliza/shared';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import amqp from 'amqplib';
import pg from 'pg';
import request from 'supertest';

import { createApp } from '../src/app.js';
import type { IdentityConfig } from '../src/config.js';
import { seedUsers } from '../src/seed.js';

export interface Harness {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  /** Events published since the harness started, in order. */
  events: AnyEvent[];
  waitForEvent: <T extends EventType>(
    type: T,
    match?: (e: Extract<AnyEvent, { type: T }>) => boolean,
  ) => Promise<Extract<AnyEvent, { type: T }>>;
  login: (
    email: string,
    password: string,
  ) => Promise<{ accessToken: string; refreshToken: string }>;
  stop: () => Promise<void>;
}

async function applyMigrations(connectionString: string): Promise<void> {
  const dir = join(import.meta.dirname, '..', 'prisma', 'migrations');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const name of readdirSync(dir)
      .filter((n) => /^\d+_/.test(n))
      .sort()) {
      await client.query(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

/** Starts PostgreSQL and RabbitMQ containers, applies the migrations and boots the real app. */
export async function startHarness(overrides: Partial<IdentityConfig> = {}): Promise<Harness> {
  const [postgres, rabbit]: [StartedPostgreSqlContainer, StartedRabbitMQContainer] =
    await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').withDatabase('identity_db').start(),
      new RabbitMQContainer('rabbitmq:4.3-alpine').start(),
    ]);
  const databaseUrl = postgres.getConnectionUri();
  await applyMigrations(databaseUrl);

  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const config: IdentityConfig = {
    port: 0,
    databaseUrl,
    rabbitmqUrl: rabbit.getAmqpUrl(),
    jwtPrivateKeyPem: keys.privateKey,
    jwtPublicKeyPem: keys.publicKey,
    accessTokenTtl: '15m',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 7,
    passwordResetTtlMinutes: 30,
    passwordResetUrl: 'http://localhost:5173/redefinir-palavra-passe',
    authRateLimitPerMinute: 1000,
    ...overrides,
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

  const prisma = (await import('../src/generated/prisma/client.js')).PrismaClient;
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const seedClient = new prisma({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  await seedUsers(seedClient);
  await seedClient.$disconnect();

  const { app } = await createApp(config, ['error', 'warn']);
  await app.init();

  const http = () => request(app.getHttpServer());

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

  const login: Harness['login'] = async (email, password) => {
    const res = await http().post('/auth/login').send({ email, password }).expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  };

  return {
    app,
    http,
    events,
    waitForEvent,
    login,
    stop: async () => {
      await app.close();
      await channel.close().catch(() => undefined);
      await conn.close().catch(() => undefined);
      await Promise.all([postgres.stop(), rabbit.stop()]);
    },
  };
}

export const ADMIN = { email: 'admin@sinaliza.pt', password: 'Admin12345' };
export const GESTOR = { email: 'gestor@sinaliza.pt', password: 'Gestor12345' };
export const MARIA = { email: 'maria.fernandes@email.pt', password: 'Cidada12345' };
