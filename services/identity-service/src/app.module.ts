import { type DynamicModule, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { coreProviders, EventPublisher, JwtSigner, JwtVerifier } from '@sinaliza/service-kit';

import { AuthController } from './auth/auth.controller.js';
import { AuthService, JWT_SIGNER } from './auth/auth.service.js';
import { IDENTITY_CONFIG, type IdentityConfig } from './config.js';
import { EventsService } from './events.service.js';
import { HealthController } from './health.controller.js';
import { PrismaService } from './prisma.service.js';
import { ProfileController, UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';

@Module({})
export class AppModule {
  static async forRoot(config: IdentityConfig): Promise<DynamicModule> {
    const [signer, verifier] = await Promise.all([
      JwtSigner.fromPem(config.jwtPrivateKeyPem, config.accessTokenTtl),
      JwtVerifier.fromPem(config.jwtPublicKeyPem),
    ]);

    return {
      module: AppModule,
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.authRateLimitPerMinute }])],
      controllers: [HealthController, AuthController, ProfileController, UsersController],
      providers: [
        ...coreProviders(verifier),
        { provide: IDENTITY_CONFIG, useValue: config },
        { provide: JWT_SIGNER, useValue: signer },
        {
          provide: EventPublisher,
          useFactory: () => new EventPublisher(config.rabbitmqUrl, 'identity-service'),
        },
        PrismaService,
        EventsService,
        AuthService,
        UsersService,
      ],
    };
  }
}
