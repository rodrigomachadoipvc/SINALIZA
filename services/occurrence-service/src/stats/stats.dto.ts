import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OCCURRENCE_STATUSES, type OccurrenceStatus } from '@sinaliza/shared';
import { IsISO8601, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    description: 'Início do período (inclusive). Por omissão, o 1.º dia do mês, há 11 meses.',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'A data «de» não é válida.' })
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Fim do período (inclusive). Por omissão, hoje.',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'A data «até» não é válida.' })
  to?: string;
}

/** Calendar days in Europe/Lisbon, `YYYY-MM-DD`, both inclusive. */
export interface Period {
  from: string;
  to: string;
}

export class PeriodDto implements Period {
  @ApiProperty({ format: 'date' })
  from: string;

  @ApiProperty({ format: 'date' })
  to: string;
}

export class TotalsDto {
  @ApiProperty({ description: 'Ocorrências criadas no período (sem anuladas).' })
  total: number;

  @ApiProperty({ description: 'Das criadas no período, as que continuam em curso.' })
  open: number;

  @ApiProperty({ description: 'Resolvidas no período (pela data de resolução).' })
  resolvedInPeriod: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Dias, das resolvidas no período.' })
  avgResolutionDays: number | null;

  @ApiProperty({ description: 'Rejeitadas / criadas no período (0–1).' })
  rejectionRate: number;

  @ApiProperty({ description: 'Duplicadas / criadas no período (0–1).' })
  duplicateRate: number;
}

export class StatusCountDto {
  @ApiProperty({ enum: OCCURRENCE_STATUSES })
  status: OccurrenceStatus;

  @ApiProperty()
  count: number;
}

export class CategoryCountDto {
  @ApiProperty({ example: 'vias' })
  slug: string;

  @ApiProperty({ example: 'Vias e pavimento' })
  name: string;

  @ApiProperty()
  count: number;
}

export class MonthlyPointDto {
  @ApiProperty({ example: '2026-03' })
  month: string;

  @ApiProperty()
  created: number;

  @ApiProperty()
  resolved: number;
}

export class CategoryResolutionDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  resolved: number;

  @ApiProperty({ description: 'Tempo médio de resolução, em dias.' })
  avgDays: number;
}

export class HotspotDto {
  @ApiProperty({ description: 'Centro da célula (grelha de ~500 m).' })
  lat: number;

  @ApiProperty()
  lng: number;

  @ApiProperty()
  count: number;
}

export class DashboardDto {
  @ApiProperty({ enum: ['postgres', 'databricks'] })
  source: 'postgres' | 'databricks';

  @ApiProperty({ format: 'date-time', description: 'Quando os dados foram calculados.' })
  updatedAt: string;

  @ApiProperty({ type: PeriodDto })
  period: PeriodDto;

  @ApiProperty({ type: TotalsDto })
  totals: TotalsDto;

  @ApiProperty({ type: [StatusCountDto] })
  byStatus: StatusCountDto[];

  @ApiProperty({ type: [CategoryCountDto] })
  byCategory: CategoryCountDto[];

  @ApiProperty({ type: [MonthlyPointDto] })
  monthlyTrend: MonthlyPointDto[];

  @ApiProperty({ type: [CategoryResolutionDto] })
  resolutionByCategory: CategoryResolutionDto[];

  @ApiProperty({ type: [HotspotDto], description: 'As 50 células com mais ocorrências.' })
  hotspots: HotspotDto[];
}
