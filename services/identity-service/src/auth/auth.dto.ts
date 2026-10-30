import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

import { UserDto } from '../users/user.dto.js';
import { IsSinalizaPassword, NormalizeEmail, Trim } from '../validation.js';

export class RegisterDto {
  @ApiProperty({ example: 'Maria Fernandes', minLength: 2, maxLength: 120 })
  @Trim()
  @IsString({ message: 'Indique o seu nome.' })
  @Length(2, 120, { message: 'O nome deve ter entre 2 e 120 caracteres.' })
  name: string;

  @ApiProperty({ example: 'maria.fernandes@email.pt' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Indique um email válido.' })
  @MaxLength(254, { message: 'O email é demasiado longo.' })
  email: string;

  @ApiProperty({
    example: 'Cidada12345',
    description: 'Mínimo 8 caracteres, com letras e números.',
  })
  @IsString({ message: 'Indique uma palavra-passe.' })
  @MaxLength(128, { message: 'A palavra-passe não pode ter mais de 128 caracteres.' })
  @IsSinalizaPassword()
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'maria.fernandes@email.pt' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Indique um email válido.' })
  email: string;

  @ApiProperty({ example: 'Cidada12345' })
  @IsString({ message: 'Indique a palavra-passe.' })
  @IsNotEmpty({ message: 'Indique a palavra-passe.' })
  @MaxLength(128, { message: 'A palavra-passe não pode ter mais de 128 caracteres.' })
  password: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token devolvido no login ou no último refresh.' })
  @IsString({ message: 'Indique o refresh token.' })
  @IsNotEmpty({ message: 'Indique o refresh token.' })
  @MaxLength(200, { message: 'O refresh token não é válido.' })
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'maria.fernandes@email.pt' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Indique um email válido.' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recebido na ligação enviada por email.' })
  @IsString({ message: 'A ligação para redefinir a palavra-passe é inválida.' })
  @IsNotEmpty({ message: 'A ligação para redefinir a palavra-passe é inválida.' })
  @MaxLength(200, { message: 'A ligação para redefinir a palavra-passe é inválida.' })
  token: string;

  @ApiProperty({ example: 'NovaPalavra123' })
  @IsString({ message: 'Indique a nova palavra-passe.' })
  @MaxLength(128, { message: 'A palavra-passe não pode ter mais de 128 caracteres.' })
  @IsSinalizaPassword()
  newPassword: string;
}

export class TokensDto {
  @ApiProperty({ description: 'JWT RS256, válido durante 15 minutos.' })
  accessToken: string;

  @ApiProperty({ description: 'Token opaco, válido durante 7 dias; é substituído a cada refresh.' })
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Validade do access token, em segundos.' })
  expiresIn: number;

  @ApiProperty({ type: UserDto })
  user: UserDto;
}

export class MessageDto {
  @ApiProperty()
  message: string;
}
