import { type DynamicModule, Module } from '@nestjs/common';
import { coreProviders, EventPublisher, JwtVerifier } from '@sinaliza/service-kit';

import { OCCURRENCE_CONFIG, type OccurrenceConfig } from './config.js';
import { EventsService } from './events.service.js';
import { HealthController } from './health.controller.js';
import { BoundaryService } from './integrations/boundary.service.js';
import { GeocoderService } from './integrations/geocoder.service.js';
import { MunicipalClient } from './integrations/municipal.client.js';
import { StorageService } from './integrations/storage.service.js';
import { LocationsController } from './locations/locations.controller.js';
import { MapController } from './map/map.controller.js';
import { OccurrencesController } from './occurrences/occurrences.controller.js';
import { OccurrencesService } from './occurrences/occurrences.service.js';
import { PhotosController } from './photos/photos.controller.js';
import { PrismaService } from './prisma.service.js';
import { DatabricksSqlClient } from './stats/databricks-sql.client.js';
import { DatabricksStatsProvider } from './stats/databricks-stats.provider.js';
import { PostgresStatsProvider } from './stats/postgres-stats.provider.js';
import { StatsController } from './stats/stats.controller.js';
import { STATS_PROVIDER } from './stats/stats.provider.js';

@Module({})
export class AppModule {
  static async forRoot(config: OccurrenceConfig): Promise<DynamicModule> {
    const verifier = await JwtVerifier.fromPem(config.jwtPublicKeyPem);
    return {
      module: AppModule,
      controllers: [
        HealthController,
        LocationsController,
        PhotosController,
        OccurrencesController,
        MapController,
        StatsController,
      ],
      providers: [
        ...coreProviders(verifier),
        { provide: OCCURRENCE_CONFIG, useValue: config },
        {
          provide: EventPublisher,
          useFactory: () => new EventPublisher(config.rabbitmqUrl, 'occurrence-service'),
        },
        PrismaService,
        EventsService,
        MunicipalClient,
        BoundaryService,
        GeocoderService,
        StorageService,
        OccurrencesService,
        {
          provide: STATS_PROVIDER,
          inject: [PrismaService],
          useFactory: (prisma: PrismaService) =>
            config.analytics.source === 'databricks'
              ? new DatabricksStatsProvider(
                  new DatabricksSqlClient(config.analytics.databricks),
                  config.analytics.databricks.cacheTtlMs,
                )
              : new PostgresStatsProvider(prisma),
        },
      ],
    };
  }
}
