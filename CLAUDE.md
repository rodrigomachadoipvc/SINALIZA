# Sinaliza — CLAUDE.md

Plataforma distribuída para reportar e acompanhar ocorrências no espaço público do concelho de
Barcelos. Projeto académico do Mestrado em Engenharia Informática do IPCA (DIA, AIS e BDA), de
Rodrigo Machado.

A especificação completa está em `docs/ESPECIFICACAO.md`. O estado do trabalho está em
`docs/PROGRESSO.md` e as decisões tomadas em `docs/DECISOES.md`. **Lê os três antes de continuar.**

## Como trabalhar

- Fala com o Rodrigo em **português de Portugal**. Ele usa o **VS Code** no Windows.
- Código, nomes de ficheiros, rotas e identificadores em **inglês**. Interface e documentação em
  **PT-PT** ("ecrã", "palavra-passe", "telemóvel", "utilizador", "registo"). Os valores dos estados
  ficam em português (`RECEBIDA`, `EM_ANALISE`, ...).
- Trabalha por fases (F0–F12, ver `docs/PROGRESSO.md`). No fim de cada fase: compila, corre lint,
  typecheck e testes, arranca os serviços, verifica que respondem, faz commit e atualiza o
  `PROGRESSO.md`.
- Commits pequenos, em inglês, Conventional Commits (`feat(identity): add refresh token rotation`).
- Ambiguidades reais: escolhe a opção mais simples e coerente com a especificação e regista-a em
  `docs/DECISOES.md`.
- Nada de `TODO` nem mocks em código entregue (exceções: Databricks opcional, SMTP local com Mailpit).
- Antes de escolher versões ou APIs, confirma a documentação oficial atual (`npm view <pkg>`). Evita
  versões publicadas há menos de 1 dia (o pnpm bloqueia-as).
- Nunca faças commit de `.env` nem de chaves privadas (`infra/keys/*.pem`).

## Stack

| Área       | Escolha                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| Runtime    | Node 24 LTS, pnpm 12 (workspaces), TypeScript 6.0 strict                      |
| Serviços   | NestJS (ESM), `@nestjs/swagger`, RabbitMQ (AMQP), PostgreSQL 16 + PostGIS 3.4 |
| Ficheiros  | RustFS (compatível com S3) com URLs pré-assinados                             |
| Backoffice | React + Vite + Tailwind + TanStack Query + Leaflet + Recharts                 |
| Mobile     | Expo (Expo Go) + React Native                                                 |
| Testes     | Vitest (unitários e e2e), Supertest, Testing Library                          |
| Analytics  | Python + Databricks (Delta Lake, medalhão Bronze/Silver/Gold)                 |

## Estrutura

```
apps/        mobile (Expo), backoffice (React + Vite)
services/    api-gateway, identity-service, occurrence-service, municipal-service, notification-service
packages/    shared (tipos, enums, máquina de estados, contratos de eventos), config (eslint, tsconfig, prettier),
             service-kit (NestJS partilhado: erros, auth JWT/RBAC, eventos, Swagger, config)
analytics/   generator, export, notebooks, databricks.yml
infra/       postgres/init, geo, caddy, keys
scripts/     gerar-chaves.sh, verificar.sh
tests/       system (testes de requisitos contra a stack real, usados pelo verificar.sh)
docs/        ESPECIFICACAO, PROGRESSO, DECISOES, ARQUITETURA, DEPLOY, api/
```

## Comandos

Mantém esta secção atualizada à medida que forem surgindo comandos.

```bash
pnpm install                 # instala todas as dependências do workspace
pnpm build                   # compila os pacotes partilhados (packages/*)
pnpm lint                    # ESLint em todos os pacotes
pnpm typecheck               # tsc --noEmit em todos os pacotes
pnpm test                    # testes de todos os pacotes
pnpm format                  # Prettier
pnpm --filter @sinaliza/shared test   # testes de um só pacote

cp .env.example .env         # primeira vez; muda as palavras-passe
sh scripts/gerar-chaves.sh   # chaves RSA do JWT em infra/keys (não fazer commit)
docker compose up -d --wait  # infraestrutura (postgis, rabbitmq, storage, mailpit)
docker compose down          # parar (acrescenta -v para apagar os dados)
docker compose up -d --build --wait   # tudo: infraestrutura, 4 serviços e gateway (API em http://localhost:8080/api, Swagger em /docs)
pnpm seed                    # contas + 45 ocorrências de demonstração (idempotente; corre dentro dos contentores)
sh scripts/verificar.sh      # sobe tudo, seed, testes de requisitos → tabela ✅/❌ RF01–RF20
sh scripts/verificar.sh --sem-build   # sem reconstruir imagens; --completo junta lint, typecheck e pnpm test
pnpm test:system             # só os testes de requisitos (tests/system; precisa da stack a correr)
pnpm --filter @sinaliza/system-tests cleanup   # apaga restos de testes interrompidos
pnpm --filter backoffice dev    # backoffice em http://localhost:5173 (usa a API em :8080)
pnpm --filter backoffice test   # testes do backoffice (Vitest + Testing Library, API simulada)
docker compose up -d --build backoffice   # backoffice servido por nginx em http://localhost:8081
pnpm --filter mobile start      # app Expo (QR code para o Expo Go; API em apps/mobile/.env)
pnpm --filter mobile web        # build web da app em http://localhost:8082 (só verificação)
pnpm --filter mobile test       # testes da app (Jest + Testing Library, API simulada)

# analytics (Python 3.11 com uv; lê o .env da raiz — ver analytics/README.md)
cd analytics && uv sync                        # ambiente Python
uv run sinaliza-generate                       # ~20 000 ocorrências sintéticas → output/generated/*.parquet
uv run sinaliza-generate --load-postgres       # + insere na occurrence_db (--replace, --purge para apagar)
uv run sinaliza-export                         # occurrence_db + municipal_db → Parquet → volume (--no-upload, --full)
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
databricks bundle deploy && databricks bundle run lakehouse_diario   # job bronze → silver → gold

# identity-service fora do Docker (lê o .env da raiz; precisa da infraestrutura a correr)
pnpm --filter identity-service migrate          # aplica migrações (prisma migrate deploy)
pnpm --filter identity-service build && pnpm --filter identity-service seed   # contas de demo
pnpm --filter identity-service dev             # API em :3001 (PORT), Swagger em /docs
pnpm --filter identity-service test:e2e        # e2e com Testcontainers (Docker a correr)
pnpm --filter identity-service openapi:export  # escreve docs/api/identity-service.json
# O mesmo para municipal-service (porta local 3002; carrega categorias e limite ao arrancar)
# e occurrence-service (porta local 3003; precisa do municipal-service e do storage a correr)
# e notification-service (porta local 3004; envia para o Mailpit em localhost:1025)
# e api-gateway (porta 8080; usa os serviços em localhost:3001–3004).
```

Portas locais dos serviços fora do Docker: identity 3001, municipal 3002, occurrence 3003, notification 3004, gateway 8080 (dentro do Docker todos
usam 3000 e não publicam portas). Rotas `/internal/*` (`@Internal()`) são só para chamadas entre
serviços, com o cabeçalho `x-internal-token`.

Prisma: o schema está em `services/<serviço>/prisma/schema.prisma`. Para criar uma migração nova sem
shadow database: `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
para uma pasta nova em `prisma/migrations/`. O cliente é gerado em `src/generated` (ignorado pelo git).

Os scripts de instalação de dependências estão bloqueados por omissão; os aprovados estão em
`allowBuilds` no `pnpm-workspace.yaml`.

URLs locais: RabbitMQ UI http://localhost:15672 · consola do storage http://localhost:9001 (9011 no
PC do Rodrigo) · Mailpit http://localhost:8025 · PostgreSQL localhost:5432.

O armazenamento de fotografias é RustFS (compatível com S3), não MinIO — ver `docs/DECISOES.md` D05.

occurrence-service: as funções PostGIS usam SQL bruto (`$queryRaw`); `lat`/`lng` são colunas geradas a
partir de `location` (só leitura). A vista `occurrence_facts` alimenta o dashboard. O limite do concelho
é copiado do municipal-service para `boundary_cache` no arranque. O reverse geocoding usa o Nominatim
com o User-Agent do projeto (nunca um email pessoal) e 1 pedido/s.

notification-service: sem base de dados e sem rotas de utilizador (só `/health`). Consome a fila
`notification.emails` (quorum); falhas de SMTP vão para `notification.emails.retry.<n>ms` e, depois da
3.ª tentativa, para `notification.emails.dlq` (ver no RabbitMQ UI). Templates em
`src/email/templates.ts` (HTML + texto, tudo escapado).

Seed: as contas estão em `services/identity-service/src/seed.ts`; as ocorrências em
`services/occurrence-service/src/seed/demo-data.ts` (dados puros, com testes) e são escritas
diretamente na `occurrence_db`, com utilizadores e categorias lidos pelo gateway (D28). Os testes de
sistema usam contas `@verificar.sinaliza.test` e apagam tudo o que criam (D29).

api-gateway: as rotas públicas estão numa lista explícita em `src/routing/routes.ts` (método, caminho,
serviço, acesso). O que não está na lista dá 404 e nunca chega a um serviço. **Quando um serviço ganha
uma rota nova, acrescenta-a lá e volta a exportar o OpenAPI do serviço**: o teste
`routes.test.ts` compara a lista com `docs/api/*.json` e falha se divergirem.

## Convenções de código

- `@sinaliza/shared` é a única fonte de verdade para perfis, estados, máquina de estados, referências,
  regras de palavra-passe e contratos de eventos. Os serviços e as apps importam daqui.
- Pacotes ESM (`"type": "module"`); imports relativos com extensão `.js`.
- Erros da API: `{ statusCode, error, message, details?, requestId }`, mensagens em PT-PT.
- Listas paginadas: `?page=1&pageSize=20` → `{ items, page, pageSize, total }`.
