import { type DynamicModule, Module } from '@nestjs/common';
import { coreProviders } from '@sinaliza/service-kit';

import { GATEWAY_CONFIG, type GatewayConfig } from './config.js';
import { DocsController } from './docs/docs.controller.js';
import { DocsService } from './docs/docs.service.js';
import { HealthController } from './health.controller.js';

@Module({})
export class AppModule {
  static forRoot(config: GatewayConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, DocsController],
      providers: [
        // The gateway's own routes are public; /api/* is handled by the gateway middleware.
        ...coreProviders(null),
        { provide: GATEWAY_CONFIG, useValue: config },
        DocsService,
      ],
    };
  }
}
