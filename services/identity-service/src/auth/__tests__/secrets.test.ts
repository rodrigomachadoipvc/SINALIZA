import { isValidPassword } from '@sinaliza/shared';
import { describe, expect, it } from 'vitest';

import {
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  newOpaqueToken,
  verifyPassword,
} from '../secrets.js';

describe('secrets', () => {
  it('hashes passwords with argon2id and verifies them', async () => {
    const hash = await hashPassword('Cidada12345');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Cidada12345')).toBe(true);
    expect(await verifyPassword(hash, 'cidada12345')).toBe(false);
  });

  it('treats a malformed hash as a failed verification', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('stores only the SHA-256 of opaque tokens', () => {
    const { token, hash } = newOpaqueToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(newOpaqueToken().token).not.toBe(token);
  });

  it('generates temporary passwords that satisfy the password rule', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(12);
      expect(isValidPassword(password)).toBe(true);
    }
  });
});
