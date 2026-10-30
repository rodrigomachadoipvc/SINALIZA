import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasRole, UserHeaders, type UserRole } from '@sinaliza/shared';
import type { Request } from 'express';

import { forbidden, unauthorized } from '../http/errors.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';
import { JwtVerifier } from './jwt.js';

export const JWT_VERIFIER = Symbol('JWT_VERIFIER');

/**
 * Global guard. The gateway already validated the token, but every service verifies it again
 * (defence in depth) and checks that the forwarded `x-user-id` header matches the token.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw unauthorized('Precisa de iniciar sessão para continuar.');
    }

    const user = await this.verifier.verify(token);
    if (!user) throw unauthorized('Sessão inválida ou expirada. Inicie sessão novamente.');

    const forwardedId = req.header(UserHeaders.ID);
    if (forwardedId && forwardedId !== user.id) {
      throw unauthorized('Sessão inválida ou expirada. Inicie sessão novamente.');
    }
    req.user = user;

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    if (roles && !hasRole(user.role, roles)) {
      throw forbidden('Não tem permissão para realizar esta ação.');
    }
    return true;
  }
}
