import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@sinaliza/service-kit';

import { EventsService } from './events.service.js';
import { BoundaryService } from './integrations/boundary.service.js';
import { StorageService } from './integrations/storage.service.js';
import { PrismaService } from './prisma.service.js';

type Check = 'up' | 'down';

interface Health {
  status: 'ok' | 'error';
  checks: { database: Check; rabbitmq: Check; storage: Check; boundary: Check };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly storage: StorageService,
    private readonly boundary: BoundaryService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Estado do serviço (usado pelo healthcheck do Docker)' })
  async check(): Promise<Health> {
    const database: Check = await this.prisma.$queryRaw`SELECT 1`.then(
      () => 'up',
      () => 'down',
    );
    const [storage, boundary] = await Promise.all([
      this.storage.isReachable().then((ok): Check => (ok ? 'up' : 'down')),
      database === 'up'
        ? this.boundary.isReady().then((ok): Check => (ok ? 'up' : 'down'))
        : Promise.resolve<Check>('down'),
    ]);
    const rabbitmq: Check = this.events.isConnected() ? 'up' : 'down';
    const health: Health = {
      status: database === 'up' ? 'ok' : 'error',
      checks: { database, rabbitmq, storage, boundary },
    };
    // Without the database nothing works; the other dependencies degrade single features
    // (photos, notifications, new reports until the boundary is cached).
    if (database === 'down') throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    return health;
  }
}
