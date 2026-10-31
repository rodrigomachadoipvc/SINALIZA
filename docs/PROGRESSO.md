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
- [x] **F6** — api-gateway (proxy, JWT, RBAC, CORS, rate limit, docs agregadas)
  - Critério: toda a API funciona via :8080 ✅ (37 verificações a partir do anfitrião: todas as
    rotas das 4 áreas, erros 400/403/404/409/422, fotografia pré-assinada, emails no Mailpit,
    Swagger agregado no browser); 16 testes e2e + 6 unitários (a lista de rotas é comparada com
    os specs OpenAPI)
- [x] **F7** — Seed completo + `scripts/verificar.sh`
  - Critério: resumo com tudo ✅ (21/21: dados de demonstração + RF01–RF20, contra o compose via
    :8080); seed idempotente (45 novas, depois 0 novas); 8 testes unitários dos dados + 5 e2e do
    seed com PostGIS real
- [x] **F8** — Backoffice completo
  - Critério: build sem erros; 22 testes (Testing Library: login e recusa de cidadãos, menus por
    perfil, filtros no URL, ações por estado, rejeição ≥ 10 caracteres, inatividade); fluxos de
    gestor e admin verificados no browser contra a API real em :8081 (validar → iniciar resolução
    → resolver, rejeitar, duplicada com pesquisa, alterar categoria, mapa, dashboard, criar e
    desativar categoria, criar gestor)
- [x] **F9** — App mobile completa
  - Critério: `expo start` sem erros; typecheck, lint e 17 testes (Jest + Testing Library: erros
    da API, renovação do token, login 401, passo 2, anular só em «Recebida», formatação,
    fotografia, rascunho); bundles Android e iOS compilados com `expo export`; fluxo completo do
    cidadão verificado contra a API real no build web (registo, login 401 → sucesso, mapa com
    filtros e painel D4, assistente com fotografia comprimida, fora/dentro do concelho, «Editar»,
    erro de rede e novo envio, detalhe, anular, lista e filtros, perfil, palavra-passe, renovação
    do token, terminar sessão, gestor recusado, recuperar palavra-passe)
- [x] **F10** — Analytics/Databricks (gerador, export, notebooks, bundle, fonte `databricks`)
  - Critério: gerador e export correm localmente ✅ (19 986 ocorrências e 74 553 eventos gerados e
    carregados na `occurrence_db` em ~20 s; dashboard Postgres com esses dados em 1,1–1,6 s; export
    completo e incremental para Parquet; `--purge` repõe a base e os contadores); notebooks válidos
    ✅ (45 testes pytest: gerador, export, formato dos notebooks, SQL no dialeto Databricks via
    sqlglot, grafo do bundle, consultas iguais às do serviço); `DatabricksStatsProvider` com 9
    testes unitários (pedido, _chunks_, erros, mapeamento, cache, 502, configuração) e verificado
    no compose (`postgres` por omissão; `databricks` com _host_ inacessível → 502 em PT-PT; sem
    variáveis → não arranca). Os notebooks e o job não correram num workspace real (falta conta
    Databricks com token).
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
- F6: `api-gateway` em http://localhost:8080 (único contentor de aplicação com porta publicada).
  Lista explícita de rotas com RBAC (`src/routing/routes.ts`, D24), cabeçalhos limpos e reescritos
  (D25), corpos em _stream_ (D26), helmet, CORS (`CORS_ORIGINS`), rate limit e Swagger agregado em
  `/docs` (D27). `docker compose up -d --build --wait` arranca agora tudo.
- F7: `pnpm seed` (raiz) corre o seed do identity-service (3 contas da especificação + 10 cidadãos
  `@example.com`) e o do occurrence-service (as 4 ocorrências da Maria iguais às do protótipo e 41 de
  outros cidadãos pelo concelho, com históricos coerentes com a máquina de estados; D28).
  `scripts/verificar.sh` sobe o compose, corre o seed e os testes de `tests/system` e imprime a
  tabela ✅/❌ (D29).
- F8: `apps/backoffice` (React 19 + Vite 8, React Router 8, TanStack Query, react-hook-form + zod,
  Tailwind 4 com os tokens no `@theme`, Leaflet + clusters, Recharts, lucide). Servido por nginx sem
  root em :8081 (`docker compose up -d --build backoffice`), com `/config.js` gerado em runtime
  (D30–D32). Logotipo em `packages/shared/assets/` (usado também pela app mobile).
  `PASSWORD_RESET_URL` passou a apontar para :8081.
- F9: `apps/mobile` (Expo SDK 57 por causa do Expo Go — D33; Expo Router, TanStack Query,
  zustand, react-hook-form + zod, axios com renovação do token, secure-store, react-native-maps +
  OSM — D34). Endereço da API em `apps/mobile/.env` (`EXPO_PUBLIC_API_URL`, ver
  `apps/mobile/README.md`). Build web em :8082 só para verificação (CORS autorizado). Falta testar
  num telemóvel real com o Expo Go.
- F10: `analytics/` (uv, Python 3.11): `sinaliza-generate` (gerador; `--load-postgres`,
  `--purge`), `sinaliza-export` (Parquet incremental → volume `sinaliza.bronze.landing`), notebooks
  `00`–`05` e `databricks.yml` (job diário 01 → 02 → 03). Lake sem dados pessoais (D35), gold no
  grão diário (D36), silver com MERGE/quarentena e Liquid Clustering (D37), fonte `databricks`
  com cache de 10 min e 502 em falha (D38), gerador transacional e removível (D39). Para ligar a um
  workspace real seguir `analytics/README.md` (conta Free Edition, token, warehouse, `.env`).
- Próximo passo: F11 (cloud, README, `ARQUITETURA.md`).
