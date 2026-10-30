import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES, type UserRole } from '@sinaliza/shared';

import type { User } from '../generated/prisma/client.js';

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Maria Fernandes' })
  name: string;

  @ApiProperty({ example: 'maria.fernandes@email.pt' })
  email: string;

  @ApiProperty({ type: String, nullable: true, example: '+351 912 345 678' })
  phone: string | null;

  @ApiProperty({ enum: USER_ROLES })
  role: UserRole;

  @ApiProperty()
  active: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt: string | null;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}
