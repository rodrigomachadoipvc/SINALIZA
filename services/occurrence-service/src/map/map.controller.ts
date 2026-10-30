import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { notFound } from '@sinaliza/service-kit';
import { OccurrenceStatus, PUBLIC_STATUSES } from '@sinaliza/shared';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { CommaList, IsBBox, occurrenceIdPipe, parseBBox } from '../common/validation.js';
import type { Prisma } from '../generated/prisma/client.js';
import { StorageService } from '../integrations/storage.service.js';
import { CategoryRefDto } from '../occurrences/occurrences.dto.js';
import { PrismaService } from '../prisma.service.js';

/** Upper bound of pins per request; the apps cluster them and narrow the bbox when zooming. */
export const MAP_PIN_LIMIT = 2000;

export class MapQueryDto {
  @ApiPropertyOptional({ description: 'oeste,sul,este,norte', example: '-8.65,41.52,-8.60,41.55' })
  @IsOptional()
  @IsBBox()
  bbox?: string;

  @ApiPropertyOptional({ description: 'Slugs de categoria separados por vírgulas.' })
  @IsOptional()
  @CommaList()
  @IsString({ each: true })
  category?: string[];

  @ApiPropertyOptional({
    description: 'Estados separados por vírgulas (as anuladas nunca aparecem).',
  })
  @IsOptional()
  @CommaList()
  @IsIn(PUBLIC_STATUSES, { each: true, message: 'Um dos estados indicados não existe.' })
  status?: OccurrenceStatus[];
}

// The public map never includes who reported an occurrence (RF15, RNF24): these DTOs have no
// citizen fields and the queries never select them.

export class MapPinDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SIN-2026-00482' })
  reference: string;

  @ApiProperty({ enum: PUBLIC_STATUSES })
  status: OccurrenceStatus;

  @ApiProperty({ type: CategoryRefDto })
  category: CategoryRefDto;

  @ApiProperty()
  lat: number;

  @ApiProperty()
  lng: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class MapPinsDto {
  @ApiProperty({ type: [MapPinDto] })
  items: MapPinDto[];

  @ApiProperty({
    description: `Verdadeiro se havia mais de ${MAP_PIN_LIMIT} pinos (aproxime o mapa).`,
  })
  truncated: boolean;
}

export class MapDetailDto extends MapPinDto {
  @ApiProperty()
  address: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: String, nullable: true, description: 'URL pré-assinado (15 min).' })
  photoUrl: string | null;
}

const PUBLIC_SELECT = {
  id: true,
  reference: true,
  status: true,
  categoryId: true,
  categoryName: true,
  categorySlug: true,
  lat: true,
  lng: true,
  createdAt: true,
} as const satisfies Prisma.OccurrenceSelect;

type PublicRow = Prisma.OccurrenceGetPayload<{ select: typeof PUBLIC_SELECT }>;

function toPin(o: PublicRow): MapPinDto {
  return {
    id: o.id,
    reference: o.reference,
    status: o.status,
    category: { id: o.categoryId, name: o.categoryName, slug: o.categorySlug },
    lat: o.lat,
    lng: o.lng,
    createdAt: o.createdAt.toISOString(),
  };
}

@ApiTags('map')
@ApiBearerAuth()
@Controller('map/occurrences')
export class MapController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Pinos do mapa público, sem dados do autor (RF15)' })
  @ApiResponse({ status: 200, type: MapPinsDto })
  async pins(@Query() query: MapQueryDto): Promise<MapPinsDto> {
    const where: Prisma.OccurrenceWhereInput = {
      status: { in: query.status ?? [...PUBLIC_STATUSES] },
      ...(query.category ? { categorySlug: { in: query.category } } : {}),
    };
    const bbox = query.bbox ? parseBBox(query.bbox) : null;
    if (bbox) {
      where.lat = { gte: bbox.minLat, lte: bbox.maxLat };
      where.lng = { gte: bbox.minLng, lte: bbox.maxLng };
    }
    const rows = await this.prisma.occurrence.findMany({
      where,
      select: PUBLIC_SELECT,
      orderBy: [{ createdAt: 'desc' }],
      take: MAP_PIN_LIMIT + 1,
    });
    return {
      items: rows.slice(0, MAP_PIN_LIMIT).map(toPin),
      truncated: rows.length > MAP_PIN_LIMIT,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe público de uma ocorrência, sem dados do autor' })
  @ApiResponse({ status: 200, type: MapDetailDto })
  async detail(@Param('id', occurrenceIdPipe) id: string): Promise<MapDetailDto> {
    const o = await this.prisma.occurrence.findUnique({
      where: { id },
      select: { ...PUBLIC_SELECT, address: true, description: true, photoKey: true },
    });
    if (!o || o.status === OccurrenceStatus.ANULADA) throw notFound('A ocorrência não existe.');
    return {
      ...toPin(o),
      address: o.address,
      description: o.description,
      photoUrl: o.photoKey ? await this.storage.signedUrl(o.photoKey) : null,
    };
  }
}
