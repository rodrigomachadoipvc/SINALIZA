import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@sinaliza/service-kit';

import { EventsService } from './events.service.js';
import { PrismaService } from './prisma.service.js';

interface Health {
  status: 'ok' | 'error';
  checks: { database: 'up' | 'down'; rabbitmq: 'up' | 'down' };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Estado do serviço (usado pelo healthcheck do Docker)' })
  async check(): Promise<Health> {
    const database = await this.prisma.$queryRaw`SELECT 1`.then(
      () => 'up' as const,
      () => 'down' as const,
    );
    const rabbitmq = this.events.isConnected() ? 'up' : 'down';
    const health: Health = {
      status: database === 'up' ? 'ok' : 'error',
      checks: { database, rabbitmq },
    };
    // RabbitMQ being down degrades email delivery but the API still works.
    if (database === 'down') throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    return health;
  }
}
