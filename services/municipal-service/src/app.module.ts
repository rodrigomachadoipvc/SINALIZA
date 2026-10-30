import { type DynamicModule, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { coreProviders, JwtVerifier } from '@sinaliza/service-kit';

import { CategoriesController } from './categories/categories.controller.js';
import { CategoriesService } from './categories/categories.service.js';
import { MUNICIPAL_CONFIG, type MunicipalConfig } from './config.js';
import { HealthController } from './health.controller.js';
import { InternalController } from './internal.controller.js';
import { MunicipalityController } from './municipality/municipality.controller.js';
import { MunicipalityService } from './municipality/municipality.service.js';
import { PrismaService } from './prisma.service.js';

@Module({})
export class AppModule implements OnApplicationBootstrap {
  constructor(
    private readonly categories: CategoriesService,
    private readonly municipality: MunicipalityService,
  ) {}

  static async forRoot(config: MunicipalConfig): Promise<DynamicModule> {
    const verifier = await JwtVerifier.fromPem(config.jwtPublicKeyPem);
    return {
      module: AppModule,
      controllers: [
        HealthController,
        CategoriesController,
        MunicipalityController,
        InternalController,
      ],
      providers: [
        ...coreProviders(verifier, config.internalToken),
        { provide: MUNICIPAL_CONFIG, useValue: config },
        PrismaService,
        CategoriesService,
        MunicipalityService,
      ],
    };
  }

  /** Reference data: default categories and the boundary are loaded on every start (idempotent). */
  async onApplicationBootstrap(): Promise<void> {
    await this.categories.seedDefaults();
    await this.municipality.seedFromFile();
  }
}
