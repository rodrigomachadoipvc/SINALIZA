import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '@sinaliza/service-kit';
import {
  CITIZEN_STATUS_GROUPS,
  CitizenStatusGroup,
  MIN_REASON_LENGTH,
  OCCURRENCE_DESCRIPTION_MAX,
  OCCURRENCE_DESCRIPTION_MIN,
  OCCURRENCE_STATUSES,
  OccurrenceStatus,
  USER_ROLES,
  type UserRole,
} from '@sinaliza/shared';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import { CoordinatesDto, CommaList, EmptyToUndefined, IsBBox, Trim } from '../common/validation.js';

// ---------------------------------------------------------------- requests

export class CreateOccurrenceDto extends CoordinatesDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Escolha uma categoria.' })
  categoryId: string;

  @ApiProperty({
    minLength: OCCURRENCE_DESCRIPTION_MIN,
    maxLength: OCCURRENCE_DESCRIPTION_MAX,
    example: 'Buraco grande na faixa de rodagem junto à passadeira.',
  })
  @Trim()
  @IsString({ message: 'Descreva a ocorrência.' })
  @Length(OCCURRENCE_DESCRIPTION_MIN, OCCURRENCE_DESCRIPTION_MAX, {
    message: `A descrição deve ter entre ${OCCURRENCE_DESCRIPTION_MIN} e ${OCCURRENCE_DESCRIPTION_MAX} caracteres.`,
  })
  description: string;

  @ApiPropertyOptional({ description: 'Devolvido por `POST /photos`.' })
  @IsOptional()
  @EmptyToUndefined()
  @IsString({ message: 'A fotografia indicada não é válida.' })
  @Matches(/^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/, {
    message: 'A fotografia indicada não é válida.',
  })
  photoKey?: string;
}

export class MineQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(CitizenStatusGroup),
    default: CitizenStatusGroup.TODAS,
  })
  @IsOptional()
  @IsIn(Object.keys(CITIZEN_STATUS_GROUPS), {
    message: 'O filtro deve ser «todas», «em_curso», «resolvidas» ou «rejeitadas».',
  })
  status: CitizenStatusGroup = CitizenStatusGroup.TODAS;
}

export const STAFF_SORTS = [
  '-createdAt',
  'createdAt',
  '-updatedAt',
  'updatedAt',
  'reference',
  '-reference',
  'status',
  '-status',
  'category',
  '-category',
] as const;
export type StaffSort = (typeof STAFF_SORTS)[number];

export class StaffListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Pesquisa na referência, morada e descrição.' })
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(100, { message: 'A pesquisa não pode passar de 100 caracteres.' })
  q?: string;

  @ApiPropertyOptional({
    description:
      'Um ou mais estados separados por vírgulas. Sem filtro, as anuladas ficam de fora.',
    example: 'RECEBIDA,EM_ANALISE',
  })
  @IsOptional()
  @CommaList()
  @IsIn(OCCURRENCE_STATUSES, { each: true, message: 'Um dos estados indicados não existe.' })
  status?: OccurrenceStatus[];

  @ApiPropertyOptional({
    description: 'Slugs de categoria separados por vírgulas.',
    example: 'vias',
  })
  @IsOptional()
  @CommaList()
  @IsString({ each: true })
  category?: string[];

  @ApiPropertyOptional({ format: 'date', description: 'Criadas a partir deste dia (inclusive).' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'A data «de» não é válida.' })
  from?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Criadas até este dia (inclusive).' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'A data «até» não é válida.' })
  to?: string;

  @ApiPropertyOptional({ description: 'oeste,sul,este,norte', example: '-8.65,41.52,-8.60,41.55' })
  @IsOptional()
  @IsBBox()
  bbox?: string;

  @ApiPropertyOptional({ enum: STAFF_SORTS, default: '-createdAt' })
  @IsOptional()
  @IsIn(STAFF_SORTS, { message: 'A ordenação indicada não existe.' })
  sort: StaffSort = '-createdAt';
}

export class ChangeCategoryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Escolha uma categoria.' })
  categoryId: string;
}

/** Statuses set through `POST /:id/status`; DUPLICADA has its own route and ANULADA is the citizen's. */
export const STAFF_TARGET_STATUSES = [
  OccurrenceStatus.EM_ANALISE,
  OccurrenceStatus.EM_RESOLUCAO,
  OccurrenceStatus.RESOLVIDA,
  OccurrenceStatus.REJEITADA,
] as const;

export class ChangeStatusDto {
  @ApiProperty({ enum: STAFF_TARGET_STATUSES })
  @IsIn(STAFF_TARGET_STATUSES, {
    message:
      'Escolha o novo estado: EM_ANALISE, EM_RESOLUCAO, RESOLVIDA ou REJEITADA. Para duplicadas use «Marcar como duplicada».',
  })
  status: (typeof STAFF_TARGET_STATUSES)[number];

  @ApiPropertyOptional({ maxLength: 1000, description: 'Nota opcional (ex.: trabalho realizado).' })
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(1000, { message: 'A nota não pode passar de 1000 caracteres.' })
  note?: string;

  @ApiPropertyOptional({
    minLength: MIN_REASON_LENGTH,
    maxLength: 1000,
    description: 'Obrigatória (≥ 10 caracteres) para rejeitar.',
  })
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(1000, { message: 'A fundamentação não pode passar de 1000 caracteres.' })
  reason?: string;
}

export class MarkDuplicateDto {
  @ApiProperty({ format: 'uuid', description: 'A ocorrência original.' })
  @IsUUID('all', { message: 'Escolha a ocorrência original.' })
  originalId: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(1000, { message: 'A nota não pode passar de 1000 caracteres.' })
  note?: string;
}

// ---------------------------------------------------------------- responses

export class CategoryRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Vias e pavimento' })
  name: string;

  @ApiProperty({ example: 'vias' })
  slug: string;
}

export class CreatedOccurrenceDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SIN-2026-00482' })
  reference: string;

  @ApiProperty({ enum: OCCURRENCE_STATUSES })
  status: OccurrenceStatus;
}

export class OccurrenceCardDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SIN-2026-00482' })
  reference: string;

  @ApiProperty({ enum: OCCURRENCE_STATUSES })
  status: OccurrenceStatus;

  @ApiProperty({ type: CategoryRefDto })
  category: CategoryRefDto;

  @ApiProperty()
  description: string;

  @ApiProperty()
  address: string;

  @ApiProperty({ type: String, nullable: true, description: 'URL pré-assinado (15 min).' })
  photoUrl: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class PaginatedCardsDto {
  @ApiProperty({ type: [OccurrenceCardDto] })
  items: OccurrenceCardDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}

export class StaffRowDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SIN-2026-00482' })
  reference: string;

  @ApiProperty({ enum: OCCURRENCE_STATUSES })
  status: OccurrenceStatus;

  @ApiProperty({ type: CategoryRefDto })
  category: CategoryRefDto;

  @ApiProperty()
  address: string;

  @ApiProperty()
  lat: number;

  @ApiProperty()
  lng: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;

  @ApiProperty({
    description:
      'Dias desde a criação: até hoje se estiver em aberto, até à resolução ou à última alteração se estiver fechada.',
  })
  daysOpen: number;
}

export class PaginatedStaffRowsDto {
  @ApiProperty({ type: [StaffRowDto] })
  items: StaffRowDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}

export class HistoryEntryDto {
  @ApiProperty({ enum: OCCURRENCE_STATUSES, nullable: true, type: String })
  from: OccurrenceStatus | null;

  @ApiProperty({ enum: OCCURRENCE_STATUSES })
  to: OccurrenceStatus;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ type: String, nullable: true })
  reason: string | null;

  @ApiProperty({ enum: USER_ROLES, description: 'Perfil de quem fez a alteração.' })
  changedByRole: UserRole;

  @ApiProperty({ format: 'date-time' })
  changedAt: string;
}

export class OccurrenceRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SIN-2026-00410' })
  reference: string;
}

export class CitizenDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;
}

export class OccurrenceDetailDto extends OccurrenceCardDto {
  @ApiProperty()
  lat: number;

  @ApiProperty()
  lng: number;

  @ApiProperty({ type: String, nullable: true })
  rejectionReason: string | null;

  @ApiProperty({
    type: OccurrenceRefDto,
    nullable: true,
    description: 'Original, se for duplicada.',
  })
  original: OccurrenceRefDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: string | null;

  @ApiProperty({ type: [HistoryEntryDto], description: 'Do mais antigo para o mais recente.' })
  history: HistoryEntryDto[];

  @ApiProperty({
    enum: OCCURRENCE_STATUSES,
    isArray: true,
    description: 'Estados para onde quem pede pode mover a ocorrência (as ações a mostrar).',
  })
  allowedTransitions: OccurrenceStatus[];

  @ApiPropertyOptional({ type: CitizenDto, description: 'Só para gestores e administradores.' })
  citizen?: CitizenDto;
}
