import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type AuthUser, CurrentUser, Public } from '@sinaliza/service-kit';

import { toUserDto, UserDto } from '../users/user.dto.js';
import {
  ForgotPasswordDto,
  LoginDto,
  MessageDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  TokensDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('register')
  @ApiOperation({ summary: 'Criar conta de cidadão (RF01)' })
  @ApiResponse({ status: 201, type: UserDto })
  @ApiResponse({ status: 409, description: 'Já existe uma conta com este email.' })
  @ApiTooManyRequestsResponse()
  async register(@Body() dto: RegisterDto): Promise<UserDto> {
    return toUserDto(await this.auth.register(dto));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sessão (RF01)' })
  @ApiResponse({ status: 200, type: TokensDto })
  @ApiResponse({ status: 401, description: 'Email ou palavra-passe incorretos.' })
  @ApiResponse({ status: 403, description: 'Conta desativada.' })
  @ApiTooManyRequestsResponse()
  login(@Body() dto: LoginDto): Promise<TokensDto> {
    return this.auth.login(dto);
  }

  /** Public: the access token may already be expired; the refresh token authenticates. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar a sessão com o refresh token (rotativo)' })
  @ApiResponse({ status: 200, type: TokensDto })
  @ApiResponse({ status: 401, description: 'Refresh token inválido, expirado ou já usado.' })
  refresh(@Body() dto: RefreshDto): Promise<TokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Terminar sessão (revoga o refresh token)' })
  @ApiResponse({ status: 204 })
  async logout(@CurrentUser() user: AuthUser, @Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(user.id, dto.refreshToken);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Pedir ligação para redefinir a palavra-passe (RF13)',
    description: 'Responde sempre 202, para não revelar se o email está registado.',
  })
  @ApiResponse({ status: 202, type: MessageDto })
  @ApiTooManyRequestsResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageDto> {
    await this.auth.forgotPassword(dto.email);
    return {
      message:
        'Se o email estiver registado, vai receber uma ligação para redefinir a palavra-passe.',
    };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Definir nova palavra-passe com o token recebido por email (RF13)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'Ligação inválida ou expirada.' })
  @ApiTooManyRequestsResponse()
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto);
  }
}
