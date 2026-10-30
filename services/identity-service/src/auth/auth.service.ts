import { Inject, Injectable } from '@nestjs/common';
import { badRequest, conflict, forbidden, JwtSigner, unauthorized } from '@sinaliza/service-kit';
import { EventType } from '@sinaliza/shared';

import { IDENTITY_CONFIG, type IdentityConfig } from '../config.js';
import { EventsService } from '../events.service.js';
import type { User } from '../generated/prisma/client.js';
import { isUniqueViolation, PrismaService } from '../prisma.service.js';
import { toUserDto } from '../users/user.dto.js';
import type { LoginDto, RegisterDto, ResetPasswordDto, TokensDto } from './auth.dto.js';
import { hashPassword, hashToken, newOpaqueToken, verifyPassword } from './secrets.js';

export const JWT_SIGNER = Symbol('JWT_SIGNER');

const INVALID_CREDENTIALS = 'Email ou palavra-passe incorretos.';
const INACTIVE_ACCOUNT = 'A sua conta está desativada. Contacte os serviços municipais.';
const INVALID_SESSION = 'Sessão inválida ou expirada. Inicie sessão novamente.';
const INVALID_RESET =
  'A ligação para redefinir a palavra-passe é inválida ou expirou. Peça uma nova.';
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  /** Verified against when the email does not exist, so both paths take the same time. */
  private readonly dummyHash = hashPassword('dummy-password-1');

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    @Inject(JWT_SIGNER) private readonly signer: JwtSigner,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  async register(dto: RegisterDto): Promise<User> {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash: await hashPassword(dto.password),
          role: 'CIDADAO',
        },
      });
      this.events.emit(EventType.USER_REGISTERED, {
        userId: user.id,
        name: user.name,
        email: user.email,
      });
      return user;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict('Já existe uma conta com este email.', [
          { field: 'email', messages: ['Já existe uma conta com este email.'] },
        ]);
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<TokensDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = await verifyPassword(user?.passwordHash ?? (await this.dummyHash), dto.password);
    if (!user || !valid) throw unauthorized(INVALID_CREDENTIALS);
    if (!user.active) throw forbidden(INACTIVE_ACCOUNT);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.issueTokens(updated);
  }

  /**
   * Rotating refresh tokens: each token works once. Presenting a token that was already
   * rotated means it leaked, so every session of that user is revoked.
   */
  async refresh(refreshToken: string): Promise<TokensDto> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw unauthorized(INVALID_SESSION);

    if (stored.revokedAt) {
      await this.revokeAll(stored.userId);
      throw unauthorized(INVALID_SESSION);
    }
    if (stored.expiresAt <= new Date()) throw unauthorized(INVALID_SESSION);
    if (!stored.user.active) throw forbidden(INACTIVE_ACCOUNT);

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Another request rotated it first (concurrent refresh with the same token).
    if (count === 0) throw unauthorized(INVALID_SESSION);

    return this.issueTokens(stored.user);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Always succeeds, so the response does not reveal whether the email exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.active) return;

    const { token, hash } = newOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.passwordResetTtlMinutes * 60_000);
    await this.prisma.$transaction([
      // Only the most recent link works.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hash, expiresAt },
      }),
    ]);

    const resetUrl = new URL(this.config.passwordResetUrl);
    resetUrl.searchParams.set('token', token);
    this.events.emit(EventType.USER_PASSWORD_RESET_REQUESTED, {
      userId: user.id,
      name: user.name,
      email: user.email,
      resetUrl: resetUrl.toString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { user: true },
    });
    if (!stored || stored.usedAt || stored.expiresAt <= new Date() || !stored.user.active) {
      throw badRequest(INVALID_RESET);
    }

    const passwordHash = await hashPassword(dto.newPassword);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User): Promise<TokensDto> {
    const accessToken = await this.signer.sign({
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    });
    const { token, hash } = newOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * DAY_MS),
      },
    });
    return {
      accessToken,
      refreshToken: token,
      expiresIn: this.config.accessTokenTtlSeconds,
      user: toUserDto(user),
    };
  }
}
