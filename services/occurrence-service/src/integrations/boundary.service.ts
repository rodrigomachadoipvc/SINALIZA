import {
  HttpStatus,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { LocalizedHttpException } from '@sinaliza/service-kit';

import { PrismaService } from '../prisma.service.js';
import { MunicipalClient } from './municipal.client.js';

const RETRY_MS = 15_000;
const REFRESH_MS = 6 * 60 * 60 * 1000;

/**
 * Keeps a local copy of the municipality boundary (boundary_cache) so ST_Contains runs in this
 * database. Refreshed from the municipal-service at start-up and every 6 hours; if the
 * municipal-service is down, the last stored copy keeps working and the refresh is retried.
 */
@Injectable()
export class BoundaryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BoundaryService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly municipal: MunicipalClient,
  ) {}

  onApplicationBootstrap(): void {
    void this.refresh();
  }

  onModuleDestroy(): void {
    clearTimeout(this.timer);
  }

  async refresh(): Promise<boolean> {
    clearTimeout(this.timer);
    try {
      const { name, boundary } = await this.municipal.getBoundary();
      await this.prisma.$transaction([
        this.prisma.$executeRaw`DELETE FROM boundary_cache WHERE name <> ${name}`,
        this.prisma.$executeRaw`
          INSERT INTO boundary_cache (name, boundary, fetched_at)
          VALUES (${name}, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(boundary)}), 4326)), now())
          ON CONFLICT (name) DO UPDATE SET boundary = EXCLUDED.boundary, fetched_at = now()
        `,
      ]);
      this.logger.log(`boundary of ${name} cached`);
      this.timer = setTimeout(() => void this.refresh(), REFRESH_MS);
      return true;
    } catch (error) {
      this.logger.warn(
        `could not refresh the boundary (${error instanceof Error ? error.message : String(error)}); retrying in ${RETRY_MS / 1000}s`,
      );
      this.timer = setTimeout(() => void this.refresh(), RETRY_MS);
      return false;
    }
  }

  async isReady(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT count(*) AS n FROM boundary_cache`;
    return (rows[0]?.n ?? 0n) > 0n;
  }

  /** RF12: is the point inside the municipality? */
  async contains(lat: number, lng: number): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ inside: boolean }>>`
      SELECT ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) AS inside
      FROM boundary_cache LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      throw new LocalizedHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Ainda não é possível validar a localização. Tente novamente dentro de momentos.',
      );
    }
    return row.inside;
  }
}
