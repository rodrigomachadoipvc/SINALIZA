import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, notFound, Roles } from '@sinaliza/service-kit';
import { isStaff, UserRole } from '@sinaliza/shared';

import {
  CategoryDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  toCategoryDto,
  UpdateCategoryDto,
} from './categories.dto.js';
import { CategoriesService } from './categories.service.js';

export const categoryIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => notFound('A categoria não existe.'),
});

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar categorias',
    description:
      'O cidadão vê só as ativas; gestores e administradores veem todas com `?all=true`.',
  })
  @ApiResponse({ status: 200, type: [CategoryDto] })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryDto[]> {
    const includeInactive = Boolean(query.all) && isStaff(user.role);
    return (await this.categories.list(includeInactive)).map(toCategoryDto);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Criar categoria (ADMIN, RF10)' })
  @ApiResponse({ status: 201, type: CategoryDto })
  @ApiResponse({ status: 409, description: 'Já existe uma categoria com este nome.' })
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryDto> {
    return toCategoryDto(await this.categories.create(dto));
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Editar nome ou ícone (ADMIN, RF10); o slug não muda' })
  @ApiResponse({ status: 200, type: CategoryDto })
  async update(
    @Param('id', categoryIdPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return toCategoryDto(await this.categories.update(id, dto));
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desativar categoria (ADMIN); deixa de aparecer ao cidadão' })
  @ApiResponse({ status: 200, type: CategoryDto })
  async deactivate(@Param('id', categoryIdPipe) id: string): Promise<CategoryDto> {
    return toCategoryDto(await this.categories.setActive(id, false));
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reativar categoria (ADMIN)' })
  @ApiResponse({ status: 200, type: CategoryDto })
  async activate(@Param('id', categoryIdPipe) id: string): Promise<CategoryDto> {
    return toCategoryDto(await this.categories.setActive(id, true));
  }
}
