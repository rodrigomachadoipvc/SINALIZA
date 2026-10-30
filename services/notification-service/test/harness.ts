import { createServer, type Server, Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { EventPublisher } from '@sinaliza/service-kit';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import amqp, { type Channel, type ChannelModel } from 'amqplib';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { createApp } from '../src/app.js';
import type { NotificationConfig } from '../src/config.js';
import { EventConsumerService } from '../src/events/event-consumer.service.js';

export interface MailpitMessage {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

export interface MailpitDetail extends MailpitMessage {
  HTML: string;
  Text: string;
}

/**
 * TCP proxy in front of Mailpit's SMTP port. While `failing` is above zero each new connection is
 * closed at once (and the counter decremented), which makes Nodemailer fail like a real outage.
 */
export interface SmtpProxy {
  port: number;
  failing: number;
  close: () => Promise<void>;
}

async function startSmtpProxy(target: { host: string; port: number }): Promise<SmtpProxy> {
  const sockets = new Set<Socket>();
  const proxy: SmtpProxy = { port: 0, failing: 0, close: () => Promise.resolve() };
  const server: Server = createServer((client) => {
    sockets.add(client);
    client.on('close', () => sockets.delete(client));
    if (proxy.failing > 0) {
      proxy.failing--;
      client.destroy();
      return;
    }
    const upstream = new Socket();
    sockets.add(upstream);
    upstream.on('close', () => sockets.delete(upstream));
    upstream.connect(target.port, target.host, () => {
      client.pipe(upstream).pipe(client);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  proxy.port = (server.address() as AddressInfo).port;
  proxy.close = () =>
    new Promise((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    });
  return proxy;
}

export interface Harness {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  publisher: EventPublisher;
  /** Raw channel for publishing malformed messages and reading the DLQ. */
  channel: Channel;
  smtp: SmtpProxy;
  mailpit: {
    messages: () => Promise<MailpitMessage[]>;
    get: (id: string) => Promise<MailpitDetail>;
    clear: () => Promise<void>;
    /** Waits until `count` messages match `predicate` (default: all messages). */
    waitFor: (
      count: number,
      predicate?: (m: MailpitMessage) => boolean,
    ) => Promise<MailpitMessage[]>;
  };
  stop: () => Promise<void>;
}

export const RETRY_DELAYS_MS = [300, 600];

export async function startHarness(): Promise<Harness> {
  const [rabbit, mailpitContainer]: [StartedRabbitMQContainer, StartedTestContainer] =
    await Promise.all([
      new RabbitMQContainer('rabbitmq:4.3-alpine').start(),
      new GenericContainer('axllent/mailpit:v1.31.6')
        .withExposedPorts(1025, 8025)
        .withWaitStrategy(Wait.forHttp('/readyz', 8025).forStatusCode(200))
        .start(),
    ]);

  const smtp = await startSmtpProxy({
    host: mailpitContainer.getHost(),
    port: mailpitContainer.getMappedPort(1025),
  });
  const mailpitUrl = `http://${mailpitContainer.getHost()}:${mailpitContainer.getMappedPort(8025)}`;

  const config: NotificationConfig = {
    port: 0,
    rabbitmqUrl: rabbit.getAmqpUrl(),
    smtp: { host: '127.0.0.1', port: smtp.port, secure: false },
    mailFrom: 'Sinaliza <nao-responder@sinaliza.pt>',
    retryDelaysMs: RETRY_DELAYS_MS,
    prefetch: 10,
  };

  const { app } = await createApp(config, ['error']);
  await app.init();
  await app.get(EventConsumerService).waitForConnect();

  const publisher = new EventPublisher(config.rabbitmqUrl, 'notification-e2e');
  await publisher.waitForConnect();
  const connection: ChannelModel = await amqp.connect(config.rabbitmqUrl);
  const channel = await connection.createChannel();

  const messages = async (): Promise<MailpitMessage[]> => {
    const res = await fetch(`${mailpitUrl}/api/v1/messages?limit=200`);
    return ((await res.json()) as { messages: MailpitMessage[] }).messages;
  };

  const mailpit: Harness['mailpit'] = {
    messages,
    get: async (id) =>
      (await (await fetch(`${mailpitUrl}/api/v1/message/${id}`)).json()) as MailpitDetail,
    clear: async () => {
      await fetch(`${mailpitUrl}/api/v1/messages`, { method: 'DELETE' });
    },
    waitFor: async (count, predicate = () => true) => {
      const deadline = Date.now() + 15_000;
      for (;;) {
        const found = (await messages()).filter(predicate);
        if (found.length >= count) return found;
        if (Date.now() > deadline) {
          throw new Error(`expected ${count} emails in Mailpit, found ${found.length}`);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    },
  };

  return {
    app,
    http: () => request(app.getHttpServer()),
    publisher,
    channel,
    smtp,
    mailpit,
    stop: async () => {
      await app.close();
      await publisher.close();
      await channel.close().catch(() => undefined);
      await connection.close().catch(() => undefined);
      await smtp.close();
      await Promise.all([rabbit.stop(), mailpitContainer.stop()]);
    },
  };
}
