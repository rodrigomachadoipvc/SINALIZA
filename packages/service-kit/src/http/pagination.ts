import { ApiPropertyOptional } from '@nestjs/swagger';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type Paginated } from '@sinaliza/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A página tem de ser um número inteiro.' })
  @Min(1, { message: 'A página tem de ser 1 ou superior.' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O tamanho da página tem de ser um número inteiro.' })
  @Min(1, { message: 'O tamanho da página tem de ser 1 ou superior.' })
  @Max(MAX_PAGE_SIZE, { message: `O tamanho da página não pode passar de ${MAX_PAGE_SIZE}.` })
  pageSize: number = DEFAULT_PAGE_SIZE;
}

export function paginate<T>(
  items: T[],
  total: number,
  query: Pick<PaginationQueryDto, 'page' | 'pageSize'>,
): Paginated<T> {
  return { items, page: query.page, pageSize: query.pageSize, total };
}

export function skipTake(query: Pick<PaginationQueryDto, 'page' | 'pageSize'>): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
