#!/bin/sh
# Verificação ponta a ponta do Sinaliza: sobe o docker compose, espera pelos healthchecks, corre o
# seed e os testes de requisitos contra a API real (http://localhost:8080) e imprime ✅/❌ por
# requisito (RF01–RF20).
#
# Uso: sh scripts/verificar.sh [--completo] [--sem-build]
#   --completo   corre também lint, typecheck e todos os testes dos pacotes (unitários e e2e com
#                Testcontainers; demora vários minutos)
#   --sem-build  não reconstrói as imagens (mais rápido quando o código não mudou)
set -u

cd "$(dirname "$0")/.."

completo=0
build=--build
for arg in "$@"; do
  case "$arg" in
    --completo) completo=1 ;;
    --sem-build) build= ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $arg (usa --help)" >&2
      exit 2
      ;;
  esac
done

report=tests/system/reports/requisitos.json
steps=""
failures=0

step() {
  # step "Descrição" comando...
  label=$1
  shift
  printf '\n▶ %s\n' "$label"
  if "$@"; then
    steps="$steps
✅ $label"
  else
    steps="$steps
❌ $label"
    failures=$((failures + 1))
    return 1
  fi
}

prerequisites() {
  ok=0
  for cmd in docker node pnpm; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Falta o comando «$cmd»." >&2
      ok=1
    fi
  done
  if ! docker info >/dev/null 2>&1; then
    echo "O Docker não está a correr." >&2
    ok=1
  fi
  if [ ! -f .env ]; then
    echo "Falta o .env: cp .env.example .env" >&2
    ok=1
  fi
  if [ ! -f infra/keys/jwt-private.pem ]; then
    sh scripts/gerar-chaves.sh || ok=1
  fi
  return $ok
}

finish() {
  printf '\n════════════════════════ Resumo ════════════════════════'
  printf '%s\n' "$steps"
  if [ -f "$report" ]; then
    node tests/system/src/summary.ts "$report" || failures=$((failures + 1))
  fi
  if [ "$failures" -eq 0 ]; then
    printf '\nVerificação concluída sem falhas. ✅\n'
    exit 0
  fi
  printf '\nVerificação com falhas. ❌\n'
  exit 1
}

rm -f "$report"

step "Pré-requisitos (docker, node, pnpm, .env, chaves JWT)" prerequisites || finish
step "Dependências (pnpm install)" pnpm install --frozen-lockfile --reporter=silent || finish
# shellcheck disable=SC2086 # $build is empty or a single flag
step "docker compose up (todos os contentores healthy)" \
  docker compose up -d $build --wait --wait-timeout 300 || {
  docker compose ps -a
  finish
}
step "Seed (contas, categorias e ocorrências de demonstração)" pnpm --silent seed || finish

if [ "$completo" -eq 1 ]; then
  step "Lint" pnpm --silent lint
  step "Typecheck" pnpm --silent typecheck
  step "Testes unitários e e2e dos pacotes" pnpm --silent test
fi

step "Testes de requisitos contra a API (gateway :8080)" \
  pnpm --silent --filter @sinaliza/system-tests exec vitest run \
  --reporter=default --reporter=json --outputFile.json=reports/requisitos.json

finish
