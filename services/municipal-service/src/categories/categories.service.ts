import { Injectable } from '@nestjs/common';
import { conflict, notFound } from '@sinaliza/service-kit';
import { DEFAULT_CATEGORIES, slugify } from '@sinaliza/shared';

import type { Category } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import type { CreateCategoryDto, UpdateCategoryDto } from './categories.dto.js';

const NOT_FOUND = 'A categoria não existe.';
const DUPLICATE_NAME = 'Já existe uma categoria com este nome.';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/** Picks a free slug: `nome`, then `nome-2`, `nome-3`, ... */
export function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || 'categoria';
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root.slice(0, 56)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Inserts the default categories that are missing (matched by slug). */
  async seedDefaults(): Promise<void> {
    await this.prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon })),
      skipDuplicates: true,
    });
  }

  list(includeInactive: boolean): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw notFound(NOT_FOUND);
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    await this.assertNameFree(dto.name);
    const base = slugify(dto.name);
    const taken = await this.prisma.category.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          icon: dto.icon,
          slug: nextFreeSlug(base, new Set(taken.map((t) => t.slug))),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(DUPLICATE_NAME, nameError());
      throw error;
    }
  }

  /** The slug never changes: filters, links and analytics depend on it. */
  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.get(id);
    if (dto.name !== undefined) await this.assertNameFree(dto.name, id);
    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.icon === undefined ? {} : { icon: dto.icon }),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(DUPLICATE_NAME, nameError());
      throw error;
    }
  }

  /** Categories are deactivated, never deleted, so existing occurrences keep their category. */
  async setActive(id: string, active: boolean): Promise<Category> {
    await this.get(id);
    return this.prisma.category.update({ where: { id }, data: { active } });
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (existing) throw conflict(DUPLICATE_NAME, nameError());
  }
}

const nameError = () => [{ field: 'name', messages: [DUPLICATE_NAME] }];
