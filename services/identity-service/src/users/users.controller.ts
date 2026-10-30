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
import { type Paginated, UserRole } from '@sinaliza/shared';

import { toUserDto, UserDto } from './user.dto.js';
import {
  ChangePasswordDto,
  CreatedGestorDto,
  CreateGestorDto,
  ListUsersQueryDto,
  UpdateProfileDto,
  UsersPageDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => notFound('O utilizador não existe.'),
});

/** Registered before UsersController so `/users/me` never matches `/users/:id`. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
export class ProfileController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Dados do utilizador autenticado (RF18)' })
  @ApiResponse({ status: 200, type: UserDto })
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return toUserDto(await this.users.get(user.id));
  }

  @Patch()
  @ApiOperation({ summary: 'Editar nome e telemóvel; o email não é editável (RF18)' })
  @ApiResponse({ status: 200, type: UserDto })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<UserDto> {
    return toUserDto(await this.users.updateProfile(user.id, dto));
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Alterar a palavra-passe (RF18)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'Palavra-passe atual incorreta ou nova inválida.' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.users.changePassword(user.id, dto);
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar utilizadores (ADMIN, RF10)' })
  @ApiResponse({ status: 200, type: UsersPageDto })
  list(@Query() query: ListUsersQueryDto): Promise<Paginated<UserDto>> {
    return this.users.list(query);
  }

  @Post('gestores')
  @ApiOperation({ summary: 'Criar conta de gestor municipal (ADMIN, RF10)' })
  @ApiResponse({ status: 201, type: CreatedGestorDto })
  @ApiResponse({ status: 409, description: 'Já existe uma conta com este email.' })
  createGestor(@Body() dto: CreateGestorDto): Promise<CreatedGestorDto> {
    return this.users.createGestor(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar nome e telemóvel de um utilizador (ADMIN)' })
  @ApiResponse({ status: 200, type: UserDto })
  async update(@Param('id', uuidPipe) id: string, @Body() dto: UpdateProfileDto): Promise<UserDto> {
    return toUserDto(await this.users.updateProfile(id, dto));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desativar conta e terminar as suas sessões (ADMIN)' })
  @ApiResponse({ status: 200, type: UserDto })
  async deactivate(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuidPipe) id: string,
  ): Promise<UserDto> {
    return toUserDto(await this.users.setActive(actor.id, id, false));
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reativar conta (ADMIN)' })
  @ApiResponse({ status: 200, type: UserDto })
  async activate(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuidPipe) id: string,
  ): Promise<UserDto> {
    return toUserDto(await this.users.setActive(actor.id, id, true));
  }
}
