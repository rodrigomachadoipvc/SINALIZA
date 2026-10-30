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
scripts/     gerar-chaves.sh, verificar.sh, seed
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
docker compose up -d --build --wait identity-service municipal-service   # serviços (migram ao arrancar)

# identity-service fora do Docker (lê o .env da raiz; precisa da infraestrutura a correr)
pnpm --filter identity-service migrate          # aplica migrações (prisma migrate deploy)
pnpm --filter identity-service build && pnpm --filter identity-service seed   # contas de demo
pnpm --filter identity-service dev             # API em :3001 (PORT), Swagger em /docs
pnpm --filter identity-service test:e2e        # e2e com Testcontainers (Docker a correr)
pnpm --filter identity-service openapi:export  # escreve docs/api/identity-service.json
# O mesmo para municipal-service (porta local 3002; carrega categorias e limite ao arrancar).
```

Portas locais dos serviços fora do Docker: identity 3001, municipal 3002 (dentro do Docker todos
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

## Convenções de código

- `@sinaliza/shared` é a única fonte de verdade para perfis, estados, máquina de estados, referências,
  regras de palavra-passe e contratos de eventos. Os serviços e as apps importam daqui.
- Pacotes ESM (`"type": "module"`); imports relativos com extensão `.js`.
- Erros da API: `{ statusCode, error, message, details?, requestId }`, mensagens em PT-PT.
- Listas paginadas: `?page=1&pageSize=20` → `{ items, page, pageSize, total }`.
