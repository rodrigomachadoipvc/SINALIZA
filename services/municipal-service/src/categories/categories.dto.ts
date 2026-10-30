import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CATEGORY_ICONS } from '@sinaliza/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

import type { Category } from '../generated/prisma/client.js';

const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

const ICON_MESSAGE = 'Escolha um ícone da lista disponível.';

export class CategoryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'iluminacao' })
  slug: string;

  @ApiProperty({ example: 'Iluminação pública' })
  name: string;

  @ApiProperty({ enum: CATEGORY_ICONS, example: 'lightbulb', description: 'Nome do ícone Lucide.' })
  icon: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export function toCategoryDto(c: Category): CategoryDto {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export class ListCategoriesQueryDto {
  @ApiPropertyOptional({
    description: 'Só para gestores e administradores: inclui as categorias desativadas.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean({ message: 'O parâmetro «all» tem de ser true ou false.' })
  all?: boolean;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Espaços verdes', minLength: 2, maxLength: 80 })
  @Trim()
  @IsString({ message: 'Indique o nome da categoria.' })
  @Length(2, 80, { message: 'O nome deve ter entre 2 e 80 caracteres.' })
  name: string;

  @ApiProperty({ enum: CATEGORY_ICONS, example: 'tree-pine' })
  @IsIn(CATEGORY_ICONS, { message: ICON_MESSAGE })
  icon: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Espaços verdes', minLength: 2, maxLength: 80 })
  @IsOptional()
  @Trim()
  @IsString({ message: 'Indique o nome da categoria.' })
  @Length(2, 80, { message: 'O nome deve ter entre 2 e 80 caracteres.' })
  name?: string;

  @ApiPropertyOptional({ enum: CATEGORY_ICONS })
  @IsOptional()
  @IsIn(CATEGORY_ICONS, { message: ICON_MESSAGE })
  icon?: string;
}
