import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Roles } from '@sinaliza/service-kit';
import { type Paginated, UserRole } from '@sinaliza/shared';
import type { Request } from 'express';

import { occurrenceIdPipe } from '../common/validation.js';
import {
  ChangeCategoryDto,
  ChangeStatusDto,
  CreatedOccurrenceDto,
  CreateOccurrenceDto,
  MarkDuplicateDto,
  MineQueryDto,
  type OccurrenceCardDto,
  OccurrenceDetailDto,
  PaginatedCardsDto,
  PaginatedStaffRowsDto,
  StaffListQueryDto,
  type StaffRowDto,
} from './occurrences.dto.js';
import { OccurrencesService } from './occurrences.service.js';

@ApiTags('occurrences')
@ApiBearerAuth()
@Controller('occurrences')
export class OccurrencesController {
  constructor(private readonly occurrences: OccurrencesService) {}

  @Post()
  @Roles(UserRole.CIDADAO)
  @ApiOperation({
    summary: 'Reportar uma ocorrência (RF03)',
    description:
      'Valida a categoria no municipal-service e a localização no limite do concelho (422 se estiver fora).',
  })
  @ApiResponse({ status: 201, type: CreatedOccurrenceDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateOccurrenceDto,
    @Req() req: Request,
  ): Promise<CreatedOccurrenceDto> {
    return this.occurrences.create(user, body, req.requestId);
  }

  // Declared before `:id` so «mine» is not taken for an id.
  @Get('mine')
  @Roles(UserRole.CIDADAO)
  @ApiOperation({ summary: 'As minhas ocorrências (RF04)' })
  @ApiResponse({ status: 200, type: PaginatedCardsDto })
  mine(
    @CurrentUser() user: AuthUser,
    @Query() query: MineQueryDto,
  ): Promise<Paginated<OccurrenceCardDto>> {
    return this.occurrences.listMine(user, query);
  }

  @Get()
  @Roles(UserRole.GESTOR)
  @ApiOperation({ summary: 'Pesquisar e filtrar ocorrências (RF16)' })
  @ApiResponse({ status: 200, type: PaginatedStaffRowsDto })
  list(@Query() query: StaffListQueryDto): Promise<Paginated<StaffRowDto>> {
    return this.occurrences.listForStaff(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalhe de uma ocorrência',
    description: 'Para o autor ou para gestores. Inclui o histórico e as ações possíveis.',
  })
  @ApiResponse({ status: 200, type: OccurrenceDetailDto })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', occurrenceIdPipe) id: string,
  ): Promise<OccurrenceDetailDto> {
    return this.occurrences.detail(user, id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.CIDADAO)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular a própria ocorrência enquanto está «Recebida» (RF20)' })
  @ApiResponse({ status: 200, type: OccurrenceDetailDto })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', occurrenceIdPipe) id: string,
  ): Promise<OccurrenceDetailDto> {
    return this.occurrences.cancel(user, id);
  }

  @Patch(':id/category')
  @Roles(UserRole.GESTOR)
  @ApiOperation({ summary: 'Alterar a categoria (RF07)' })
  @ApiResponse({ status: 200, type: OccurrenceDetailDto })
  changeCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', occurrenceIdPipe) id: string,
    @Body() body: ChangeCategoryDto,
    @Req() req: Request,
  ): Promise<OccurrenceDetailDto> {
    return this.occurrences.changeCategory(user, id, body.categoryId, req.requestId);
  }

  @Post(':id/status')
  @Roles(UserRole.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Alterar o estado (RF06, RF08)',
    description:
      'Transições inválidas devolvem 409; rejeitar exige `reason` com 10 ou mais caracteres.',
  })
  @ApiResponse({ status: 200, type: OccurrenceDetailDto })
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', occurrenceIdPipe) id: string,
    @Body() body: ChangeStatusDto,
  ): Promise<OccurrenceDetailDto> {
    return this.occurrences.changeStatus(user, id, {
      to: body.status,
      note: body.note,
      reason: body.reason,
    });
  }

  @Post(':id/duplicate')
  @Roles(UserRole.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar como duplicada de outra ocorrência (RF09)' })
  @ApiResponse({ status: 200, type: OccurrenceDetailDto })
  markDuplicate(
    @CurrentUser() user: AuthUser,
    @Param('id', occurrenceIdPipe) id: string,
    @Body() body: MarkDuplicateDto,
  ): Promise<OccurrenceDetailDto> {
    return this.occurrences.markDuplicate(user, id, body.originalId, body.note);
  }
}
