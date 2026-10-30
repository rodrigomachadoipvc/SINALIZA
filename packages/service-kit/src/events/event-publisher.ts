import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import {
  createEvent,
  EVENTS_EXCHANGE,
  type EventEnvelope,
  type EventPayloads,
  type EventType,
} from '@sinaliza/shared';
import amqp, { type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

/**
 * Publishes domain events to the `sinaliza.events` topic exchange with publisher confirms.
 * amqp-connection-manager reconnects automatically and buffers messages while RabbitMQ is down.
 */
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);
  private readonly connection: AmqpConnectionManager;
  private readonly channel: ChannelWrapper;

  constructor(url: string, source: string) {
    this.connection = amqp.connect([url], { connectionOptions: { clientProperties: { source } } });
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown reason'}`),
    );
    this.channel = this.connection.createChannel({
      json: false,
      confirm: true,
      setup: (ch: ConfirmChannel) =>
        ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true }).then(() => undefined),
    });
  }

  async publish<T extends EventType>(
    type: T,
    payload: EventPayloads[T],
  ): Promise<EventEnvelope<T>> {
    const event = createEvent(type, payload, randomUUID());
    await this.channel.publish(EVENTS_EXCHANGE, type, Buffer.from(JSON.stringify(event)), {
      persistent: true,
      contentType: 'application/json',
      messageId: event.eventId,
      type,
      timestamp: Math.floor(Date.now() / 1000),
    });
    return event;
  }

  async waitForConnect(): Promise<void> {
    await this.channel.waitForConnect();
  }

  isConnected(): boolean {
    return this.connection.isConnected();
  }

  async close(): Promise<void> {
    await this.channel.close();
    await this.connection.close();
  }
}
