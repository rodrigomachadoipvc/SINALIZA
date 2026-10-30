import { timingSafeEqual } from 'node:crypto';

import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasRole, UserHeaders, type UserRole } from '@sinaliza/shared';
import type { Request } from 'express';

import { forbidden, unauthorized } from '../http/errors.js';
import { INTERNAL_TOKEN_HEADER, IS_INTERNAL_KEY, IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';
import { JwtVerifier } from './jwt.js';

export const JWT_VERIFIER = Symbol('JWT_VERIFIER');
export const INTERNAL_TOKEN = Symbol('INTERNAL_TOKEN');

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Global guard. The gateway already validated the token, but every service verifies it again
 * (defence in depth) and checks that the forwarded `x-user-id` header matches the token.
 * A service without user routes (notification-service) passes no verifier: only `@Public()`
 * and `@Internal()` routes are then reachable.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier | null,
    @Inject(INTERNAL_TOKEN) private readonly internalToken: string | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const req = context.switchToHttp().getRequest<Request>();

    if (this.reflector.getAllAndOverride<boolean>(IS_INTERNAL_KEY, targets)) {
      const presented = req.header(INTERNAL_TOKEN_HEADER);
      if (!this.internalToken || !presented || !sameSecret(presented, this.internalToken)) {
        throw unauthorized('Pedido interno não autorizado.');
      }
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw unauthorized('Precisa de iniciar sessão para continuar.');
    }

    const user = this.verifier ? await this.verifier.verify(token) : null;
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
