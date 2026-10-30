# Progresso

Atualizado no fim de cada fase, para que uma nova sessão consiga retomar o trabalho.
Especificação: `docs/ESPECIFICACAO.md` (secção 14 tem os critérios de conclusão de cada fase).

## Fases

- [x] **F0** — Monorepo pnpm, `packages/config`, `packages/shared`, `CLAUDE.md`, `PROGRESSO.md`, git
  - Critério: `pnpm install`, `pnpm lint` e `pnpm typecheck` passam ✅ (e `pnpm test`: 79 testes)
- [x] **F1** — Infraestrutura no compose (postgis + init, rabbitmq, storage S3 + bucket, mailpit), chaves
      RSA, `.env.example`
  - Critério: todos os contentores ficam _healthy_ ✅; isolamento das BDs verificado (cada utilizador
    só tem `CONNECT` à sua base); bucket criado de forma idempotente
- [x] **F2** — identity-service (auth, utilizadores, eventos, Swagger, testes)
  - Critério: e2e de auth passam ✅ (30 testes e2e com Testcontainers + 4 unitários); contentor
    _healthy_ no compose, aplica as migrações ao arrancar
- [x] **F3** — municipal-service (categorias, município + limite de Barcelos)
  - Critério: seed e endpoints funcionam ✅ (20 testes e2e + 8 unitários; contentor _healthy_,
    chamada interna verificada a partir de outro contentor)
- [x] **F4** — occurrence-service (ocorrências, máquina de estados, PostGIS, MinIO, Nominatim, mapa,
      estatísticas via Postgres, eventos)
  - Critério: e2e de ocorrências passam ✅ (29 testes e2e com PostGIS, RabbitMQ e RustFS reais +
    20 unitários); contentor _healthy_ no compose, teste de fumo com o municipal e o Nominatim reais
- [x] **F5** — notification-service (consumidores, templates, retries, DLQ)
  - Critério: os emails aparecem no Mailpit ✅ (registo → boas-vindas, ocorrência → confirmação,
    rejeição → email com a fundamentação, no compose); 6 testes e2e com RabbitMQ e Mailpit reais
    (retries, DLQ, duplicados, mensagens ilegíveis) + 12 unitários
- [ ] **F6** — api-gateway (proxy, JWT, RBAC, CORS, rate limit, docs agregadas)
- [ ] **F7** — Seed completo + `scripts/verificar.sh`
- [ ] **F8** — Backoffice completo
- [ ] **F9** — App mobile completa
- [ ] **F10** — Analytics/Databricks (gerador, export, notebooks, bundle, fonte `databricks`)
- [ ] **F11** — Cloud (Caddy, `docker-compose.cloud.yml`, `DEPLOY.md`) + README + `ARQUITETURA.md`
- [ ] **F12** — Verificação final

## Notas para retomar

- F0: `@sinaliza/shared` já tem perfis, estados, grupos de filtro do cidadão, máquina de estados
  (`checkTransition`, `allowedTransitions`, `checkDuplicateTarget`), referências `SIN-AAAA-NNNNN`,
  regra de palavra-passe, categorias por omissão e contratos de eventos. Compila para `dist/` com
  `pnpm build` — os outros pacotes dependem do `dist/`.
- F1: `docker-compose.yml` tem postgis (PG 16 + PostGIS 3.6), rabbitmq 4.3, storage (RustFS, em vez
  da MinIO — ver D05), storage-init (cria o bucket) e mailpit. O script
  `infra/postgres/init/01-databases.sh` cria `identity_db`, `occurrence_db` e `municipal_db`, cada
  uma com o seu utilizador; PostGIS nas duas últimas. Para arrancar: `cp .env.example .env`,
  `sh scripts/gerar-chaves.sh`, `docker compose up -d --wait`.
- F2: novo pacote `@sinaliza/service-kit` com o que os 5 serviços partilham: filtro de erros PT-PT,
  `x-request-id`, `ValidationPipe` (whitelist + forbidNonWhitelisted), guarda global JWT RS256 +
  RBAC (`@Public`, `@Roles`, `@CurrentUser`), `EventPublisher` (RabbitMQ com confirms), paginação,
  Swagger em `/docs` e `/docs/openapi.json`, helpers de configuração. O `identity-service` usa Prisma 7
  (`prisma/schema.prisma`, migrações em `prisma/migrations`, cliente gerado em `src/generated`),
  argon2id, refresh tokens rotativos com deteção de reutilização, tokens guardados como SHA-256.
  Seed das 3 contas de demonstração em `src/seed.ts`. Os testes e2e (`test/`) arrancam PostgreSQL e
  RabbitMQ reais com Testcontainers (precisam do Docker a correr).
- Padrão para os próximos serviços: copiar a estrutura do identity-service (`app.ts` com
  `createApp`, `AppModule.forRoot(config)`, `config.ts`, `test/harness.ts`, Dockerfile multi-stage
  com `pnpm deploy`, porta 3000 dentro do contentor, sem portas publicadas).
- F3: `municipal-service` com categorias (seed das 6 por omissão em cada arranque, slug estável,
  nome único sem distinguir maiúsculas, ícone validado contra `CATEGORY_ICONS` do `shared`) e
  município (limite real do OSM em `infra/geo/barcelos.geojson`, carregado em cada arranque).
  Rotas internas para o occurrence-service: `GET /internal/categories/:id` e
  `GET /internal/municipality`, com `x-internal-token` (`INTERNAL_API_TOKEN`; ver D13). O
  service-kit ganhou o decorador `@Internal()`.
- F4: `occurrence-service` (porta local 3003). Ocorrências com `location` geography + `lat`/`lng`
  gerados, referência por contador anual na mesma transação, histórico, transições com concorrência
  otimista (`updateMany where status = from` → 409), eventos `occurrence.created` e
  `occurrence.status_changed` (inclui ANULADA). Integrações em `src/integrations/`: municipal
  (categoria + limite, com `x-internal-token`), `boundary_cache`, Nominatim (cache + 1 pedido/s +
  recurso às coordenadas) e storage S3 (URLs pré-assinados com `S3_PUBLIC_ENDPOINT`). Estatísticas
  pela interface `StatsProvider` (só `postgres` por agora; ver D20). Decisões D16–D20.
- F5: `notification-service` (porta local 3004), sem BD e sem chave JWT (D23). Fila quorum
  `notification.emails` ligada aos 4 tipos de evento; retries por filas de atraso e DLQ (D21);
  idempotência por LRU de `eventId` (D22). Nodemailer com SMTP do `.env` (Mailpit por omissão).
  Templates em `src/email/templates.ts`. Os e2e usam um proxy TCP à frente do Mailpit para simular
  falhas de SMTP.
- Próximo passo: F6 (api-gateway): único ponto de entrada, verifica o JWT, envia os cabeçalhos
  `x-user-*` e `x-request-id`, CORS, rate limit, nunca encaminha `/internal`, Swagger com seletor
  dos specs de `docs/api/`.
