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
| Ficheiros  | MinIO (S3) com URLs pré-assinados                                             |
| Backoffice | React + Vite + Tailwind + TanStack Query + Leaflet + Recharts                 |
| Mobile     | Expo (Expo Go) + React Native                                                 |
| Testes     | Vitest (unitários e e2e), Supertest, Testing Library                          |
| Analytics  | Python + Databricks (Delta Lake, medalhão Bronze/Silver/Gold)                 |

## Estrutura

```
apps/        mobile (Expo), backoffice (React + Vite)
services/    api-gateway, identity-service, occurrence-service, municipal-service, notification-service
packages/    shared (tipos, enums, máquina de estados, contratos de eventos), config (eslint, tsconfig, prettier)
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
```

## Convenções de código

- `@sinaliza/shared` é a única fonte de verdade para perfis, estados, máquina de estados, referências,
  regras de palavra-passe e contratos de eventos. Os serviços e as apps importam daqui.
- Pacotes ESM (`"type": "module"`); imports relativos com extensão `.js`.
- Erros da API: `{ statusCode, error, message, details?, requestId }`, mensagens em PT-PT.
- Listas paginadas: `?page=1&pageSize=20` → `{ items, page, pageSize, total }`.
