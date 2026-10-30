import { Injectable } from '@nestjs/common';
import { badRequest, conflict, notFound, paginate, skipTake } from '@sinaliza/service-kit';
import type { Paginated } from '@sinaliza/shared';

import { AuthService } from '../auth/auth.service.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../auth/secrets.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { isUniqueViolation, PrismaService } from '../prisma.service.js';
import { toUserDto, type UserDto } from './user.dto.js';
import type {
  ChangePasswordDto,
  CreatedGestorDto,
  CreateGestorDto,
  ListUsersQueryDto,
  UpdateProfileDto,
} from './users.dto.js';

const USER_NOT_FOUND = 'O utilizador não existe.';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async get(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound(USER_NOT_FOUND);
    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    await this.get(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.phone === undefined ? {} : { phone: dto.phone }),
      },
    });
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.get(id);
    if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw badRequest('A palavra-passe atual está incorreta.', [
        { field: 'currentPassword', messages: ['A palavra-passe atual está incorreta.'] },
      ]);
    }
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(dto.newPassword) },
    });
  }

  async list(query: ListUsersQueryDto): Promise<Paginated<UserDto>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(query) }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items.map(toUserDto), total, query);
  }

  async createGestor(dto: CreateGestorDto): Promise<CreatedGestorDto> {
    const temporaryPassword = dto.temporaryPassword ?? generateTemporaryPassword();
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash: await hashPassword(temporaryPassword),
          role: 'GESTOR',
        },
      });
      return { user: toUserDto(user), temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict('Já existe uma conta com este email.', [
          { field: 'email', messages: ['Já existe uma conta com este email.'] },
        ]);
      }
      throw error;
    }
  }

  async setActive(actorId: string, id: string, active: boolean): Promise<User> {
    if (actorId === id && !active) {
      throw conflict('Não pode desativar a sua própria conta.');
    }
    await this.get(id);
    const user = await this.prisma.user.update({ where: { id }, data: { active } });
    if (!active) await this.auth.revokeAll(id);
    return user;
  }
}
