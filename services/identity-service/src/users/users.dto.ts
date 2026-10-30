import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '@sinaliza/service-kit';
import { USER_ROLES, type UserRole } from '@sinaliza/shared';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import {
  EmptyToNull,
  IsSinalizaPassword,
  NormalizeEmail,
  PHONE_PATTERN,
  Trim,
} from '../validation.js';
import { UserDto } from './user.dto.js';

const PHONE_MESSAGE = 'Indique um telemóvel válido (só algarismos, espaços e o prefixo +).';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Maria Fernandes', minLength: 2, maxLength: 120 })
  @IsOptional()
  @Trim()
  @IsString({ message: 'Indique o nome.' })
  @Length(2, 120, { message: 'O nome deve ter entre 2 e 120 caracteres.' })
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '+351 912 345 678',
    description: 'Vazio ou null apaga o telemóvel.',
  })
  @IsOptional()
  @EmptyToNull()
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: PHONE_MESSAGE })
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string | null;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString({ message: 'Indique a palavra-passe atual.' })
  @IsNotEmpty({ message: 'Indique a palavra-passe atual.' })
  @MaxLength(128, { message: 'A palavra-passe não pode ter mais de 128 caracteres.' })
  currentPassword: string;

  @ApiProperty({ example: 'NovaPalavra123' })
  @IsString({ message: 'Indique a nova palavra-passe.' })
  @MaxLength(128, { message: 'A palavra-passe não pode ter mais de 128 caracteres.' })
  @IsSinalizaPassword()
  newPassword: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: USER_ROLES })
  @IsOptional()
  @IsIn(USER_ROLES, { message: 'O perfil indicado não existe.' })
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Pesquisa por nome ou email.' })
  @IsOptional()
  @Trim()
  @IsString({ message: 'A pesquisa tem de ser texto.' })
  @MaxLength(100, { message: 'A pesquisa não pode ter mais de 100 caracteres.' })
  q?: string;
}

export class CreateGestorDto {
  @ApiProperty({ example: 'João Silva' })
  @Trim()
  @IsString({ message: 'Indique o nome.' })
  @Length(2, 120, { message: 'O nome deve ter entre 2 e 120 caracteres.' })
  name: string;

  @ApiProperty({ example: 'joao.silva@cm-barcelos.pt' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Indique um email válido.' })
  @MaxLength(254, { message: 'O email é demasiado longo.' })
  email: string;

  @ApiPropertyOptional({
    description: 'Palavra-passe temporária. Se não for indicada, é gerada automaticamente.',
  })
  @IsOptional()
  @IsString({ message: 'A palavra-passe temporária tem de ser texto.' })
  @MaxLength(128, { message: 'A palavra-passe não pode ter mais de 128 caracteres.' })
  @IsSinalizaPassword()
  temporaryPassword?: string;
}

export class CreatedGestorDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty({ description: 'Mostrada apenas uma vez; o gestor deve alterá-la.' })
  temporaryPassword: string;
}

export class UsersPageDto {
  @ApiProperty({ type: [UserDto] })
  items: UserDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}
