import { EVENTS_DLX, EVENTS_EXCHANGE, EventType } from '@sinaliza/shared';
import type { ConfirmChannel } from 'amqplib';

/** The durable queue this service consumes from. */
export const EMAIL_QUEUE = 'notification.emails';
/** Messages that failed every attempt or could not be read. Inspect them in the RabbitMQ UI. */
export const EMAIL_DLQ = 'notification.emails.dlq';

/** Every event that results in an email. */
export const EMAIL_EVENTS: readonly EventType[] = [
  EventType.USER_REGISTERED,
  EventType.USER_PASSWORD_RESET_REQUESTED,
  EventType.OCCURRENCE_CREATED,
  EventType.OCCURRENCE_STATUS_CHANGED,
];

/** One delay queue per retry; the delay is in the name because queue arguments cannot change. */
export const retryQueue = (delayMs: number): string => `${EMAIL_QUEUE}.retry.${delayMs}ms`;

/**
 * Declares the exchanges, queues and bindings (idempotent, runs on every (re)connection):
 *
 *   sinaliza.events ──(event types)──► notification.emails ──(nack)──► sinaliza.events.dlx ──► .dlq
 *   retry: publish to notification.emails.retry.<n>ms; when its TTL expires the message is
 *   dead-lettered back to notification.emails through the default exchange.
 */
export async function setupTopology(
  ch: ConfirmChannel,
  retryDelaysMs: readonly number[],
  prefetch: number,
): Promise<void> {
  await ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  await ch.assertExchange(EVENTS_DLX, 'direct', { durable: true });

  await ch.assertQueue(EMAIL_DLQ, { durable: true });
  await ch.bindQueue(EMAIL_DLQ, EVENTS_DLX, EMAIL_QUEUE);

  await ch.assertQueue(EMAIL_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': EVENTS_DLX,
      'x-dead-letter-routing-key': EMAIL_QUEUE,
    },
  });
  for (const type of EMAIL_EVENTS) await ch.bindQueue(EMAIL_QUEUE, EVENTS_EXCHANGE, type);

  for (const delay of retryDelaysMs) {
    await ch.assertQueue(retryQueue(delay), {
      durable: true,
      arguments: {
        'x-message-ttl': delay,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': EMAIL_QUEUE,
      },
    });
  }
  await ch.prefetch(prefetch);
}
