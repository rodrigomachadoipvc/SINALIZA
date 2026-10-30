import { type DynamicModule, Module } from '@nestjs/common';
import { coreProviders } from '@sinaliza/service-kit';

import { NOTIFICATION_CONFIG, type NotificationConfig } from './config.js';
import { MailerService } from './email/mailer.service.js';
import { EventConsumerService } from './events/event-consumer.service.js';
import { HealthController } from './health.controller.js';

@Module({})
export class AppModule {
  static forRoot(config: NotificationConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        // No user routes, so no JWT verifier: only /health (public) is exposed.
        ...coreProviders(null),
        { provide: NOTIFICATION_CONFIG, useValue: config },
        MailerService,
        EventConsumerService,
      ],
    };
  }
}
