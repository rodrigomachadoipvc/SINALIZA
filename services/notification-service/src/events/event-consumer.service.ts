import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type AnyEvent, EVENTS_DLX, isEventEnvelope } from '@sinaliza/shared';
import amqp, { type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';

import { NOTIFICATION_CONFIG, type NotificationConfig } from '../config.js';
import { MailerService } from '../email/mailer.service.js';
import { emailFor } from '../email/templates.js';
import { LruSet } from './lru-set.js';
import { EMAIL_QUEUE, retryQueue, setupTopology } from './topology.js';

/** Header with the delivery attempt (1 for the first delivery). */
export const ATTEMPT_HEADER = 'x-attempt';
/** Header with the last error, set on messages sent to the DLQ. */
export const ERROR_HEADER = 'x-last-error';

const PROCESSED_CAPACITY = 10_000;

type Outcome = 'sent' | 'duplicate' | 'retry' | 'dead-letter' | 'invalid';

/**
 * Consumes the email events. Each message is acknowledged only after the email is sent, retried
 * with growing delays when sending fails, and moved to the DLQ after the last attempt. Event ids
 * already handled are remembered (LRU), so redelivered messages do not send a second email.
 */
@Injectable()
export class EventConsumerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerService.name);
  private readonly processed = new LruSet(PROCESSED_CAPACITY);
  /** Events being handled right now: a parallel redelivery waits for them instead of sending. */
  private readonly inFlight = new Map<string, Promise<Outcome>>();
  private connection: AmqpConnectionManager | undefined;
  private channel: ChannelWrapper | undefined;

  constructor(
    @Inject(NOTIFICATION_CONFIG) private readonly config: NotificationConfig,
    private readonly mailer: MailerService,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = amqp.connect([this.config.rabbitmqUrl], {
      connectionOptions: { clientProperties: { source: 'notification-service' } },
    });
    this.connection.on('connect', () => this.logger.log('connected to RabbitMQ'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown reason'}`),
    );
    this.channel = this.connection.createChannel({
      json: false,
      confirm: true,
      setup: async (ch: ConfirmChannel) => {
        await setupTopology(ch, this.config.retryDelaysMs, this.config.prefetch);
        await ch.consume(EMAIL_QUEUE, (msg) => {
          if (msg) void this.handle(msg);
        });
      },
    });
  }

  /** Resolves once the queues exist and the consumer is registered (used by tests). */
  async waitForConnect(): Promise<void> {
    await this.channel?.waitForConnect();
  }

  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async handle(msg: ConsumeMessage): Promise<void> {
    const channel = this.channel;
    if (!channel) return;
    let outcome: Outcome;
    let event: AnyEvent | undefined;
    try {
      event = parse(msg.content);
      outcome = event ? await this.process(msg, event) : 'invalid';
      if (outcome === 'invalid') {
        // Unreadable messages can never succeed: straight to the DLQ (queue dead-letter exchange).
        channel.nack(msg, false, false);
      } else {
        channel.ack(msg);
      }
    } catch (error) {
      // Republishing to a retry queue or the DLQ failed (RabbitMQ unavailable): requeue.
      this.logger.error(`could not route message: ${describe(error)}`);
      channel.nack(msg, false, true);
      return;
    }
    const ref = event ? `${event.type} ${event.eventId}` : 'unreadable message';
    if (outcome === 'invalid') this.logger.error(`${ref} moved to the DLQ`);
    else if (outcome === 'duplicate') this.logger.log(`${ref} already processed, ignored`);
  }

  private async process(msg: ConsumeMessage, event: AnyEvent): Promise<Outcome> {
    if (this.processed.has(event.eventId)) return 'duplicate';
    const running = this.inFlight.get(event.eventId);
    if (running) {
      // The first copy sends the email, or schedules its own retry; this one is redundant.
      await running.catch(() => undefined);
      return 'duplicate';
    }
    const work = this.deliver(msg, event);
    this.inFlight.set(event.eventId, work);
    try {
      return await work;
    } finally {
      this.inFlight.delete(event.eventId);
    }
  }

  private async deliver(msg: ConsumeMessage, event: AnyEvent): Promise<Outcome> {
    const attempt = attemptOf(msg);
    try {
      await this.mailer.send(emailFor(event), event.eventId);
    } catch (error) {
      const delays = this.config.retryDelaysMs;
      const reason = describe(error);
      if (attempt <= delays.length) {
        const delay = delays[attempt - 1] ?? 0;
        this.logger.warn(
          `${event.type} ${event.eventId} attempt ${attempt} failed (${reason}); retrying in ${delay} ms`,
        );
        await this.channel?.sendToQueue(retryQueue(delay), msg.content, {
          ...copyProperties(msg),
          headers: { ...msg.properties.headers, [ATTEMPT_HEADER]: attempt + 1 },
        });
        return 'retry';
      }
      this.logger.error(
        `${event.type} ${event.eventId} failed after ${attempt} attempts (${reason}); moved to the DLQ`,
      );
      await this.channel?.publish(EVENTS_DLX, EMAIL_QUEUE, msg.content, {
        ...copyProperties(msg),
        headers: {
          ...msg.properties.headers,
          [ATTEMPT_HEADER]: attempt,
          [ERROR_HEADER]: reason.slice(0, 500),
        },
      });
      return 'dead-letter';
    }

    this.processed.add(event.eventId);
    this.logger.log(`${event.type} ${event.eventId} email sent (attempt ${attempt})`);
    return 'sent';
  }
}

function parse(content: Buffer): AnyEvent | undefined {
  try {
    const value: unknown = JSON.parse(content.toString('utf8'));
    return isEventEnvelope(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function attemptOf(msg: ConsumeMessage): number {
  const raw: unknown = msg.properties.headers?.[ATTEMPT_HEADER];
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function copyProperties(msg: ConsumeMessage): {
  persistent: true;
  contentType?: string;
  messageId?: string;
  type?: string;
  timestamp?: number;
} {
  const p = msg.properties;
  return {
    persistent: true,
    ...(typeof p.contentType === 'string' ? { contentType: p.contentType } : {}),
    ...(typeof p.messageId === 'string' ? { messageId: p.messageId } : {}),
    ...(typeof p.type === 'string' ? { type: p.type } : {}),
    ...(typeof p.timestamp === 'number' ? { timestamp: p.timestamp } : {}),
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
