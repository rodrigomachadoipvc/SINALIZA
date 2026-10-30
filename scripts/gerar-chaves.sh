#!/bin/sh
# Generates the RS256 key pair used to sign (identity-service) and verify (gateway, services) JWTs.
# Usage: sh scripts/gerar-chaves.sh [--force]
set -eu

cd "$(dirname "$0")/.."
dir=infra/keys
private="$dir/jwt-private.pem"
public="$dir/jwt-public.pem"

if [ -f "$private" ] && [ "${1:-}" != "--force" ]; then
  echo "As chaves já existem em $dir (usa --force para as substituir)."
  exit 0
fi

mkdir -p "$dir"

if command -v openssl >/dev/null 2>&1; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$private" 2>/dev/null
  openssl pkey -in "$private" -pubout -out "$public"
else
  node -e "
    const { generateKeyPairSync } = require('node:crypto');
    const { writeFileSync } = require('node:fs');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    writeFileSync('$private', privateKey, { mode: 0o600 });
    writeFileSync('$public', publicKey);
  "
fi

chmod 600 "$private" 2>/dev/null || true
echo "Chaves criadas: $private (privada, não fazer commit) e $public."
