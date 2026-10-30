import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@sinaliza/service-kit';

import { MailerService } from './email/mailer.service.js';
import { EventConsumerService } from './events/event-consumer.service.js';

type Check = 'up' | 'down';

interface Health {
  status: 'ok' | 'error';
  checks: { rabbitmq: Check; smtp: Check };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly consumer: EventConsumerService,
    private readonly mailer: MailerService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Estado do serviço (usado pelo healthcheck do Docker)' })
  async check(): Promise<Health> {
    const rabbitmq: Check = this.consumer.isConnected() ? 'up' : 'down';
    const smtp: Check = (await this.mailer.isReachable()) ? 'up' : 'down';
    const health: Health = {
      status: rabbitmq === 'up' ? 'ok' : 'error',
      checks: { rabbitmq, smtp },
    };
    // Without RabbitMQ no event arrives. When SMTP is down messages wait in the retry queues
    // and the DLQ, so the service itself stays healthy.
    if (rabbitmq === 'down') throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    return health;
  }
}
