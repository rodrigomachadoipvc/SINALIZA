import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@sinaliza/shared';
import type { Request } from 'express';

import type { AuthUser } from '../http/request-context.js';

export const IS_PUBLIC_KEY = 'sinaliza:isPublic';
export const ROLES_KEY = 'sinaliza:roles';

/** The route does not require an access token. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** The route requires one of these roles (ADMIN also satisfies GESTOR). */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user into a handler parameter. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<Request>().user;
  if (!user) throw new Error('CurrentUser used on a public route');
  return user;
});
