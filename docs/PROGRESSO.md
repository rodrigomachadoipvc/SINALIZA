# Progresso

Atualizado no fim de cada fase, para que uma nova sessão consiga retomar o trabalho.
Especificação: `docs/ESPECIFICACAO.md` (secção 14 tem os critérios de conclusão de cada fase).

## Fases

- [x] **F0** — Monorepo pnpm, `packages/config`, `packages/shared`, `CLAUDE.md`, `PROGRESSO.md`, git
  - Critério: `pnpm install`, `pnpm lint` e `pnpm typecheck` passam ✅ (e `pnpm test`: 79 testes)
- [ ] **F1** — Infraestrutura no compose (postgis + init, rabbitmq, minio + bucket, mailpit), chaves RSA,
      `.env.example`
- [ ] **F2** — identity-service (auth, utilizadores, eventos, Swagger, testes)
- [ ] **F3** — municipal-service (categorias, município + limite de Barcelos)
- [ ] **F4** — occurrence-service (ocorrências, máquina de estados, PostGIS, MinIO, Nominatim, mapa,
      estatísticas via Postgres, eventos)
- [ ] **F5** — notification-service (consumidores, templates, retries, DLQ)
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
- Próximo passo: F1.
