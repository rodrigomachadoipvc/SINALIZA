import { readFileSync } from 'node:fs';

import { isUserRole } from '@sinaliza/shared';
import { importPKCS8, importSPKI, jwtVerify, SignJWT, type CryptoKey } from 'jose';

import type { AuthUser } from '../http/request-context.js';

export const JWT_ALGORITHM = 'RS256';
export const JWT_ISSUER = 'sinaliza-identity';
export const JWT_AUDIENCE = 'sinaliza';

/** Reads a PEM from an inline value (`-----BEGIN ...`) or from a file path. */
export function readPem(valueOrPath: string): string {
  return valueOrPath.includes('-----BEGIN') ? valueOrPath : readFileSync(valueOrPath, 'utf8');
}

/** Verifies access tokens with the identity-service public key. */
export class JwtVerifier {
  private constructor(private readonly key: CryptoKey) {}

  static async fromPem(publicKeyPem: string): Promise<JwtVerifier> {
    return new JwtVerifier(await importSPKI(publicKeyPem, JWT_ALGORITHM));
  }

  /** Returns the user, or null when the token is invalid, expired or malformed. */
  async verify(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      const { sub, role, email, name } = payload as Record<string, unknown>;
      if (
        typeof sub !== 'string' ||
        !isUserRole(role) ||
        typeof email !== 'string' ||
        typeof name !== 'string'
      ) {
        return null;
      }
      return { id: sub, role, email, name };
    } catch {
      return null;
    }
  }
}

/** Signs access tokens. Only the identity-service holds the private key. */
export class JwtSigner {
  private constructor(
    private readonly key: CryptoKey,
    private readonly ttl: string,
  ) {}

  static async fromPem(privateKeyPem: string, ttl: string): Promise<JwtSigner> {
    return new JwtSigner(await importPKCS8(privateKeyPem, JWT_ALGORITHM), ttl);
  }

  sign(user: AuthUser): Promise<string> {
    return new SignJWT({ role: user.role, email: user.email, name: user.name })
      .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(this.ttl)
      .sign(this.key);
  }
}
