import type { UserRole } from '@sinaliza/shared';

/** The authenticated caller, taken from a verified access token. */
export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    user?: AuthUser;
  }
}
