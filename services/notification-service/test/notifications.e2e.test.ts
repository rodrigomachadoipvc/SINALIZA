import { randomUUID } from 'node:crypto';

import { createEvent, EVENTS_EXCHANGE, EventType, OccurrenceStatus } from '@sinaliza/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ATTEMPT_HEADER, ERROR_HEADER } from '../src/events/event-consumer.service.js';
import { EMAIL_DLQ } from '../src/events/topology.js';
import { type Harness, type MailpitMessage, startHarness } from './harness.js';

const to = (address: string) => (m: MailpitMessage) => m.To.some((t) => t.Address === address);

describe('notification-service (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h?.stop();
  });

  beforeEach(async () => {
    h.smtp.failing = 0;
    await h.mailpit.clear();
  });

  /** Reads one message from the DLQ, waiting for it to arrive. */
  const fromDlq = async () => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const msg = await h.channel.get(EMAIL_DLQ, { noAck: true });
      if (msg) return msg;
      if (Date.now() > deadline) throw new Error('nothing in the DLQ');
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  it('reports RabbitMQ and SMTP in /health', async () => {
    const res = await h.http().get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { rabbitmq: 'up', smtp: 'up' } });
  });

  it('sends one email per event type to Mailpit', async () => {
    const email = 'ana.costa@email.pt';
    const citizen = { id: randomUUID(), name: 'Ana Costa', email };
    await h.publisher.publish(EventType.USER_REGISTERED, {
      userId: citizen.id,
      name: citizen.name,
      email,
    });
    await h.publisher.publish(EventType.USER_PASSWORD_RESET_REQUESTED, {
      userId: citizen.id,
      name: citizen.name,
      email,
      resetUrl: 'http://localhost:5173/redefinir-palavra-passe?token=abc',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    await h.publisher.publish(EventType.OCCURRENCE_CREATED, {
      id: randomUUID(),
      reference: 'SIN-2026-00007',
      citizen,
      category: { id: randomUUID(), name: 'Vias e pavimento', slug: 'vias' },
      address: 'Rua Dr. Manuel Pais 12, Barcelos',
      createdAt: new Date().toISOString(),
    });
    await h.publisher.publish(EventType.OCCURRENCE_STATUS_CHANGED, {
      id: randomUUID(),
      reference: 'SIN-2026-00007',
      citizen,
      from: OccurrenceStatus.RECEBIDA,
      to: OccurrenceStatus.REJEITADA,
      reason: 'Situação em propriedade privada.',
      changedAt: new Date().toISOString(),
    });

    const received = await h.mailpit.waitFor(4, to(email));
    expect(received.map((m) => m.Subject).sort()).toEqual(
      [
        'Bem-vindo ao Sinaliza',
        'Ocorrência SIN-2026-00007 recebida',
        'Ocorrência SIN-2026-00007: Rejeitada',
        'Redefinir a palavra-passe do Sinaliza',
      ].sort(),
    );

    const rejection = received.find((m) => m.Subject.endsWith('Rejeitada'));
    const detail = await h.mailpit.get(rejection?.ID ?? '');
    expect(detail.HTML).toContain('Situação em propriedade privada.');
    expect(detail.Text).toContain('Fundamentação:');
  });

  it('sends a single email when the same event is delivered twice', async () => {
    const email = 'duplicado@email.pt';
    const event = createEvent(
      EventType.USER_REGISTERED,
      { userId: randomUUID(), name: 'Rui', email },
      randomUUID(),
    );
    const body = Buffer.from(JSON.stringify(event));
    h.channel.publish(EVENTS_EXCHANGE, event.type, body, { messageId: event.eventId });
    h.channel.publish(EVENTS_EXCHANGE, event.type, body, { messageId: event.eventId });

    await h.mailpit.waitFor(1, to(email));
    await new Promise((r) => setTimeout(r, 1000));
    expect((await h.mailpit.messages()).filter(to(email))).toHaveLength(1);
  });

  it('retries with backoff and delivers once SMTP recovers', async () => {
    const email = 'retry@email.pt';
    h.smtp.failing = 2; // the first two attempts fail, the third succeeds
    const started = Date.now();
    await h.publisher.publish(EventType.USER_REGISTERED, {
      userId: randomUUID(),
      name: 'Inês',
      email,
    });
    await h.mailpit.waitFor(1, to(email));
    // 300 ms + 600 ms of backoff (RETRY_DELAYS_MS).
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(h.smtp.failing).toBe(0);
  });

  it('moves the message to the DLQ after 3 failed attempts', async () => {
    const email = 'dlq@email.pt';
    h.smtp.failing = 3;
    const event = await h.publisher.publish(EventType.USER_REGISTERED, {
      userId: randomUUID(),
      name: 'Paulo',
      email,
    });

    const dead = await fromDlq();
    expect(JSON.parse(dead.content.toString()).eventId).toBe(event.eventId);
    expect(dead.properties.headers?.[ATTEMPT_HEADER]).toBe(3);
    expect(String(dead.properties.headers?.[ERROR_HEADER])).not.toBe('');
    expect((await h.mailpit.messages()).filter(to(email))).toHaveLength(0);
  });

  it('sends unreadable messages straight to the DLQ', async () => {
    h.channel.publish(EVENTS_EXCHANGE, EventType.USER_REGISTERED, Buffer.from('{not json'));
    const dead = await fromDlq();
    expect(dead.content.toString()).toBe('{not json');

    // The consumer keeps working afterwards.
    await h.publisher.publish(EventType.USER_REGISTERED, {
      userId: randomUUID(),
      name: 'Depois',
      email: 'depois@email.pt',
    });
    await h.mailpit.waitFor(1, to('depois@email.pt'));
  });
});
