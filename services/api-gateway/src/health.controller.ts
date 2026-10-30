import { Controller, Get, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@sinaliza/service-kit';

import { GATEWAY_CONFIG, type GatewayConfig, SERVICE_NAMES, type ServiceName } from './config.js';

type Check = 'up' | 'down';

interface Health {
  status: 'ok';
  services: Record<ServiceName, Check>;
}

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  @Public()
  @Get()
  async check(): Promise<Health> {
    const results = await Promise.all(
      SERVICE_NAMES.map(async (name): Promise<[ServiceName, Check]> => {
        try {
          const res = await fetch(new URL('/health', this.config.services[name]), {
            signal: AbortSignal.timeout(2000),
          });
          return [name, res.ok ? 'up' : 'down'];
        } catch {
          return [name, 'down'];
        }
      }),
    );
    // The gateway itself is up; a service that is down only affects its own routes.
    return { status: 'ok', services: Object.fromEntries(results) as Record<ServiceName, Check> };
  }
}
