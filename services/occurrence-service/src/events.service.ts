import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { EventPublisher } from '@sinaliza/service-kit';
import type { EventPayloads, EventType } from '@sinaliza/shared';

/**
 * Publishes events without blocking the HTTP request: amqp-connection-manager buffers messages
 * while RabbitMQ is unavailable and sends them once it reconnects (see docs/DECISOES.md D09).
 */
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly publisher: EventPublisher) {}

  emit<T extends EventType>(type: T, payload: EventPayloads[T]): void {
    this.publisher
      .publish(type, payload)
      .then((event) => this.logger.log(`published ${type} ${event.eventId}`))
      .catch((error: unknown) =>
        this.logger.error(
          `failed to publish ${type}`,
          error instanceof Error ? error.stack : error,
        ),
      );
  }

  isConnected(): boolean {
    return this.publisher.isConnected();
  }

  async onModuleDestroy(): Promise<void> {
    await this.publisher.close();
  }
}
