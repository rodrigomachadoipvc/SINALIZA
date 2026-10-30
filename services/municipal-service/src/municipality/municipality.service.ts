import { readFileSync } from 'node:fs';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { notFound } from '@sinaliza/service-kit';

import { MUNICIPAL_CONFIG, type MunicipalConfig } from '../config.js';
import { PrismaService } from '../prisma.service.js';
import { extractBoundary, type MultiPolygonGeometry } from './boundary.js';

export interface MunicipalityView {
  name: string;
  boundary: MultiPolygonGeometry;
}

const DEFAULT_NAME = 'Barcelos';

@Injectable()
export class MunicipalityService {
  private readonly logger = new Logger(MunicipalityService.name);
  /** The boundary only changes when the service restarts with a new file, so it is cached. */
  private cached: MunicipalityView | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MUNICIPAL_CONFIG) private readonly config: MunicipalConfig,
  ) {}

  /** Loads the boundary file into the database (insert or update; idempotent). */
  async seedFromFile(): Promise<void> {
    const { name, geometry } = extractBoundary(
      JSON.parse(readFileSync(this.config.boundaryGeoJsonPath, 'utf8')),
    );
    const municipality = name ?? DEFAULT_NAME;
    // ST_MakeValid + ST_CollectionExtract guarantee a valid MultiPolygon even if the source
    // polygon self-intersects after simplification.
    await this.prisma.$executeRaw`
      INSERT INTO municipality (id, name, boundary, updated_at)
      VALUES (
        gen_random_uuid(),
        ${municipality},
        ST_Multi(ST_CollectionExtract(ST_MakeValid(
          ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)), 3)),
        now()
      )
      ON CONFLICT (name) DO UPDATE SET boundary = EXCLUDED.boundary, updated_at = now()
    `;
    this.cached = null;
    this.logger.log(`boundary of ${municipality} loaded from ${this.config.boundaryGeoJsonPath}`);
  }

  async get(): Promise<MunicipalityView> {
    if (this.cached) return this.cached;
    const rows = await this.prisma.$queryRaw<Array<{ name: string; boundary: string }>>`
      SELECT name, ST_AsGeoJSON(boundary, 6) AS boundary FROM municipality ORDER BY created_at LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw notFound('O limite do concelho ainda não foi carregado.');
    this.cached = { name: row.name, boundary: JSON.parse(row.boundary) as MultiPolygonGeometry };
    return this.cached;
  }
}
