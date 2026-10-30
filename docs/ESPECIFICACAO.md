# PROMPT — Construir a plataforma SINALIZA (completa, de uma vez)

> Cola este texto inteiro no Claude Code, dentro da pasta vazia do projeto.

---

## 0. Como deves trabalhar (lê primeiro)

És o engenheiro responsável por construir, do zero e até ao fim, a plataforma **Sinaliza**. É um projeto académico do Mestrado em Engenharia Informática do IPCA, comum a três unidades curriculares: **Desenvolvimento de Interfaces Aplicacionais (DIA)**, **Arquiteturas e Integração de Sistemas (AIS)** e **Bases de Dados Avançadas (BDA)**. Tem de funcionar sem erros, de ponta a ponta, hoje.

Regras de trabalho:

1. **Começa por planear.** Lê este documento todo e cria:
   - `CLAUDE.md` na raiz, com o resumo do projeto, as convenções e os comandos;
   - `docs/PROGRESSO.md`, com as fases da secção 14 em forma de lista de verificação.
     Atualiza o `docs/PROGRESSO.md` no fim de cada fase, para que uma nova sessão consiga retomar o trabalho.
2. **Trabalha por fases** (secção 14). No fim de cada fase:
   - compila;
   - corre lint, _typecheck_ e testes;
   - arranca os serviços e verifica que respondem;
   - faz `git commit` com uma mensagem descritiva.
     Não avances com erros por resolver.
3. **Não pares a meio** nem peças confirmação para decisões que este documento já toma. Se encontrares uma ambiguidade real, escolhe a opção mais simples e coerente com o documento, regista-a em `docs/DECISOES.md` e continua.
4. **Nada de "TODO" nem "mock" em código entregue**, exceto onde este documento o permite explicitamente: Databricks opcional em modo local e SMTP local com Mailpit.
5. **Idiomas:**
   - código, nomes de ficheiros, rotas da API e identificadores em **inglês**;
   - **interface e documentação em português de Portugal** (PT-PT, não PT-BR: "ecrã", "palavra-passe", "telemóvel", "utilizador", "registo");
   - os valores dos estados ficam em português (ver 3.3).
6. **Versões:** usa versões estáveis atuais (Node 20 LTS, NestJS 10+, Expo SDK estável mais recente, React 18+, PostgreSQL 16 + PostGIS 3.4) e fixa as versões no `package.json`.
7. **Gestor de pacotes:** `pnpm` com _workspaces_.

---

## 1. O produto

**Sinaliza** é um sistema distribuído para reportar e acompanhar ocorrências no espaço público do **concelho de Barcelos** (Portugal): buracos na via, iluminação avariada, resíduos acumulados, sinalização danificada, passeios degradados, barreiras à acessibilidade.

- **Cidadão** (App Mobile): regista-se e inicia sessão. Reporta uma ocorrência com fotografia opcional, categoria, descrição e localização GPS validada dentro de Barcelos. Vê todas as ocorrências no mapa, sem identificação do autor. Acompanha as suas ocorrências e o histórico de estados, anula-as enquanto estão «Recebida» e recebe um email sempre que o estado muda.
- **Gestor Municipal** (Backoffice Web): consulta, pesquisa e filtra ocorrências. Valida ou rejeita (com fundamentação obrigatória), altera a categoria, atualiza o estado, marca como duplicada (associando à original) e consulta o dashboard de indicadores.
- **Administrador** (Backoffice Web): tudo o que o Gestor faz, mais a gestão de **categorias** e de **contas de Gestor Municipal**.

> **IMPORTANTE — fora do âmbito, não implementar:** encaminhamento de ocorrências para departamentos, a entidade «departamento» e o estado «Encaminhada». Foram retirados do projeto.

---

## 2. Arquitetura (AIS) — obrigatória

```
[App Mobile (Expo)] ─┐                         ┌─► identity-service ──► identity_db (PostgreSQL)
                     ├─HTTPS/REST─► api-gateway├─► occurrence-service ─► occurrence_db (PostgreSQL+PostGIS)
[Backoffice (React)]─┘   (JWT, RBAC, CORS,     │        │  └─► MinIO (S3) – fotografias
                          rate limit, docs)    │        │  └─► Nominatim (reverse geocoding)
                                               └─► municipal-service ─► municipal_db (PostgreSQL+PostGIS)
occurrence-service ─(AMQP: eventos)─► RabbitMQ ─► notification-service ─► SMTP (Mailpit local / SendGrid ou Mailtrap na cloud)
identity-service  ─(AMQP: eventos)─►    ┘
occurrence_db ──(exportação Parquet)──► Databricks (Bronze/Silver/Gold) ──► KPIs ──► dashboard do backoffice
```

Requisitos de arquitetura (RNF01–RNF11):

- **4 microserviços NestJS independentes:** `identity-service`, `occurrence-service`, `municipal-service` e `notification-service`, cada um com o seu `Dockerfile`, a sua configuração e a sua **base de dados própria**.
- **Isolamento de dados (RNF07):** um único contentor `postgis/postgis` com três bases de dados (`identity_db`, `occurrence_db`, `municipal_db`) e **três utilizadores de BD distintos**. Cada utilizador só tem permissões na sua base; cria-os num script de _init_. O `notification-service` não tem BD.
- **API Gateway** (`api-gateway`, NestJS) como **único ponto de entrada**. Faz:
  - encaminhamento por prefixo;
  - validação do JWT;
  - RBAC por rota;
  - CORS;
  - _rate limiting_;
  - `helmet`;
  - _correlation id_ (`x-request-id`);
  - agregação da documentação OpenAPI.
    Os serviços só estão na rede interna do Docker; apenas o gateway (e o backoffice) expõem portas.
- **Comunicação síncrona REST.** Há pelo menos uma chamada serviço-a-serviço real: o `occurrence-service` chama o `municipal-service` para validar se a categoria existe e está ativa, e para obter o limite do concelho.
- **Comunicação assíncrona com RabbitMQ (AMQP):**
  - _exchange_ `sinaliza.events`, do tipo _topic_;
  - filas _durable_;
  - _dead-letter queue_;
  - tentativas com _backoff_;
  - consumidores **idempotentes** (guardam o `eventId` processado).
- **OpenAPI (RNF04):** cada serviço tem `@nestjs/swagger` em `/docs`, com os DTOs anotados. O gateway serve em `/docs` um Swagger UI com um seletor para os quatro specs. Exporta também os `openapi.json` para `docs/api/`.
- **Segurança:**
  - JWT **RS256**: o `identity-service` assina com a chave privada e o gateway (e os serviços, em defesa em profundidade) verificam com a chave pública;
  - _access token_ de 15 min;
  - _refresh token_ de 7 dias, rotativo e guardado com _hash_;
  - palavras-passe com **argon2**, no mínimo 8 caracteres com letras e números;
  - `ValidationPipe` com `whitelist` e `forbidNonWhitelisted`;
  - _rate limit_ no login;
  - segredos apenas em `.env` (cria `.env.example`; nunca faças commit de `.env`).
    O gateway envia aos serviços os cabeçalhos `x-user-id`, `x-user-role`, `x-user-email` e `x-user-name`; os serviços voltam a verificar o JWT.
- **HTTPS/TLS (RNF06):** em local usa HTTP. Na cloud usa **Caddy** à frente do gateway e do backoffice, com TLS automático (perfil `cloud` do docker compose; ver secção 12).
- **Contentores (RNF09):** `docker compose up --build` arranca **tudo**, com _healthchecks_ e `depends_on: condition: service_healthy`:
  - postgis, rabbitmq (com _management_), minio e um contentor de _init_ `minio-mc` que cria o _bucket_ `occurrence-photos`;
  - mailpit;
  - os 4 serviços, o gateway e o backoffice (build estático servido por nginx).
- **Fotografias (RNF11):** guardadas no MinIO; a BD guarda apenas a `photo_key`. São servidas por **URL pré-assinada** (GET, 15 min), gerada com o _endpoint_ público do MinIO configurável.

Portas locais sugeridas:

| Componente          | Porta                      |
| ------------------- | -------------------------- |
| Gateway             | 8080                       |
| Backoffice          | 5173 (dev) ou 8081 (nginx) |
| RabbitMQ UI         | 15672                      |
| MinIO API / consola | 9000 / 9001                |
| Mailpit UI          | 8025                       |
| PostgreSQL          | 5432                       |

---

## 3. Domínio e dados

### 3.1 Perfis

`CIDADAO`, `GESTOR` e `ADMIN`.

- O registo público cria sempre `CIDADAO`.
- As contas `GESTOR` são criadas pelo `ADMIN`.
- O `ADMIN` tem acesso a tudo o que o `GESTOR` tem.

### 3.2 Categorias (seed, `municipal-service`)

| slug        | nome                      | ícone (lucide)  |
| ----------- | ------------------------- | --------------- |
| vias        | Vias e pavimento          | `car`           |
| iluminacao  | Iluminação pública        | `lightbulb`     |
| residuos    | Resíduos e limpeza        | `trash-2`       |
| sinalizacao | Sinalização               | `signpost`      |
| passeios    | Passeios e acessibilidade | `accessibility` |
| outro       | Outro                     | `ellipsis`      |

Cada categoria tem os campos `id`, `slug`, `name`, `icon`, `active`, `createdAt` e `updatedAt`. Uma categoria só pode ser desativada, nunca apagada, se tiver ocorrências.

### 3.3 Estados da ocorrência e máquina de estados

Estados: `RECEBIDA`, `EM_ANALISE`, `EM_RESOLUCAO`, `RESOLVIDA`, `REJEITADA`, `DUPLICADA` e `ANULADA`.

`ANULADA` só é definido pelo Cidadão (RF20). Não aparece no mapa nem nas listas do Cidadão. No backoffice só aparece com o filtro «Anuladas».

Transições permitidas (as restantes devolvem 409):

| De                   | Para         | Quem          | Regras                                                                                 |
| -------------------- | ------------ | ------------- | -------------------------------------------------------------------------------------- |
| RECEBIDA             | EM_ANALISE   | Gestor/Admin  | «Validar»                                                                              |
| RECEBIDA, EM_ANALISE | REJEITADA    | Gestor/Admin  | `reason` obrigatória (≥ 10 caracteres)                                                 |
| RECEBIDA, EM_ANALISE | DUPLICADA    | Gestor/Admin  | `originalId` obrigatório: existe, é diferente da própria e não é DUPLICADA nem ANULADA |
| EM_ANALISE           | EM_RESOLUCAO | Gestor/Admin  | `note` opcional                                                                        |
| EM_RESOLUCAO         | RESOLVIDA    | Gestor/Admin  | `note` opcional                                                                        |
| RECEBIDA             | ANULADA      | Cidadão autor | só a própria ocorrência                                                                |

Cada transição:

- cria um registo em `status_history` (`from`, `to`, `note` ou `reason`, `changedBy`, `changedByRole`, `changedAt`);
- publica o evento `occurrence.status_changed`.

Implementa a máquina de estados num módulo puro, com testes unitários para todas as transições.

### 3.4 Referência

`SIN-AAAA-NNNNN` (ex.: `SIN-2026-00482`), sequencial por ano. Gera-a numa transação, com uma sequência ou tabela de contadores.

### 3.5 Modelo de dados (mínimo)

**`identity_db`:**

- `users`: `id`, `name`, `email` (único, minúsculas), `phone?`, `password_hash`, `role`, `active`, `created_at`, `updated_at`, `last_login_at`.
- `refresh_tokens`: `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at`.
- `password_reset_tokens`: `id`, `user_id`, `token_hash`, `expires_at` (30 min), `used_at`.

**`municipal_db`:**

- `categories` (ver 3.2).
- `municipality`: `id`, `name`, `boundary` geometry(MultiPolygon, 4326).

**`occurrence_db`:**

- `occurrences`:
  - `id`, `reference`;
  - `citizen_id`, `citizen_name`, `citizen_email` (_snapshot_ para notificações);
  - `category_id`, `category_name`, `category_slug` (_snapshot_);
  - `description` (10–500 caracteres), `status`;
  - `location` geography(Point, 4326), `address`, `photo_key?`;
  - `original_id?`, `rejection_reason?`;
  - `created_at`, `updated_at`, `resolved_at?`, `cancelled_at?`;
  - índice GIST em `location`.
- `status_history`.
- `boundary_cache`: cópia do limite do concelho, obtida do `municipal-service` no arranque, para fazer `ST_Contains` localmente.
- `processed_events` (idempotência).

Usa **Prisma** (com `Unsupported("geography")` e SQL bruto para as funções PostGIS) ou **TypeORM**. Escolhe um e usa-o em todos os serviços. Usa **migrações** versionadas, não `synchronize: true`.

### 3.6 Limite do concelho de Barcelos (RF12)

1. Tenta obter o polígono **real** do concelho de Barcelos a partir do OpenStreetMap (Nominatim, `polygon_geojson=1`, município de Barcelos, distrito de Braga) ou da CAOP (DGT). Grava-o em `infra/geo/barcelos.geojson`, simplificado com tolerância de cerca de 0,0005.
2. Se não houver rede, usa como recurso temporário um polígono aproximado com a caixa envolvente aproximada (lat 41,43–41,65; lon −8,78 a −8,47) e regista em `docs/DECISOES.md` que deve ser substituído.
3. O `municipal-service` faz o _seed_ da tabela `municipality` a partir desse ficheiro.
4. A validação é feita com `ST_Contains(boundary, ponto)` no `occurrence-service`.

---

## 4. Eventos (RabbitMQ)

Usa o envelope `{ eventId (uuid), type, occurredAt, version: 1, payload }`.

| Tipo                            | Publicado por | Payload                                                                         | Consumido por                                      |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| `user.registered`               | identity      | userId, name, email                                                             | notification (email de boas-vindas)                |
| `user.password_reset_requested` | identity      | userId, name, email, resetUrl, expiresAt                                        | notification (email com ligação)                   |
| `occurrence.created`            | occurrence    | id, reference, citizen{id,name,email}, category, address, createdAt             | notification (email de confirmação)                |
| `occurrence.status_changed`     | occurrence    | id, reference, citizen{…}, from, to, note/reason, originalReference?, changedAt | notification (email de alteração de estado — RF05) |

O `notification-service`:

- envia **emails HTML em PT-PT** com a marca Sinaliza (azul `#1A2B4C`, amarelo `#FFC107`, texto alternativo em _plain text_);
- usa Nodemailer;
- tem SMTP configurável por `.env` (Mailpit em local; SendGrid ou Mailtrap na cloud);
- faz até 3 tentativas com _backoff_ e depois envia para a DLQ;
- regista `eventId` processados em memória (LRU) e responde idempotentemente a mensagens repetidas.

Os emails de alteração de estado explicam o novo estado em linguagem simples. No caso de rejeição incluem a fundamentação; no de duplicada, a referência da original.

---

## 5. API REST (através do gateway, prefixo `/api`)

Todas as respostas de erro seguem o formato `{ statusCode, error, message, details?, requestId }`, com mensagens em PT-PT legíveis para o utilizador. As listas são paginadas com `?page=1&pageSize=20` e devolvem `{ items, page, pageSize, total }` (RNF19).

**Identity**

| Método e rota                                                           | Acesso      | Descrição                                                  |
| ----------------------------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| `POST /api/auth/register`                                               | público     | Cria um CIDADAO (`name`, `email`, `password`)              |
| `POST /api/auth/login`                                                  | público     | `{ accessToken, refreshToken, user }`; conta inativa → 403 |
| `POST /api/auth/refresh` · `POST /api/auth/logout`                      | autenticado |                                                            |
| `POST /api/auth/forgot-password`                                        | público     | Responde sempre 202 (não revela se o email existe)         |
| `POST /api/auth/reset-password`                                         | público     | `token`, `newPassword`                                     |
| `GET /api/users/me` · `PATCH /api/users/me`                             | autenticado | Edita `name` e `phone`; o email não é editável             |
| `POST /api/users/me/password`                                           | autenticado | `currentPassword`, `newPassword`                           |
| `GET /api/users?role=GESTOR&q=&page=`                                   | ADMIN       |                                                            |
| `POST /api/users/gestores`                                              | ADMIN       | Cria um gestor (`name`, `email`, palavra-passe temporária) |
| `PATCH /api/users/:id` · `POST /api/users/:id/deactivate` · `/activate` | ADMIN       |                                                            |

**Municipal**

| Método e rota                                                                                              | Acesso                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /api/categories`                                                                                      | autenticado; o cidadão só vê as ativas, o staff vê todas com `?all=true` |
| `POST /api/categories` · `PATCH /api/categories/:id` · `POST /api/categories/:id/deactivate` · `/activate` | ADMIN                                                                    |
| `GET /api/municipality`                                                                                    | autenticado — `{ name, boundary (GeoJSON) }`                             |

**Occurrence**

| Método e rota                                                           | Acesso         | Descrição                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/locations/validate`                                          | CIDADAO        | `{lat,lng}` → `{ inside, address }`. Reverse geocoding no Nominatim com `User-Agent` próprio, cache por coordenada arredondada e no máximo 1 pedido/s; se falhar, devolve as coordenadas como morada |
| `POST /api/photos`                                                      | CIDADAO        | _multipart_ (`file`): só JPEG, PNG ou WebP, ≤ 5 MB; o servidor reduz para ≤ 1600 px e ≤ 2 MB com `sharp` → `{ photoKey, previewUrl }`                                                                |
| `POST /api/occurrences`                                                 | CIDADAO        | `{ categoryId, description, lat, lng, photoKey? }` → 201 `{ id, reference, status }`. Valida a categoria (REST ao municipal) e o limite (PostGIS → 422 «fora do concelho»)                           |
| `GET /api/occurrences/mine?status=&page=`                               | CIDADAO        | Grupos de filtro: `todas`, `em_curso` (RECEBIDA, EM_ANALISE, EM_RESOLUCAO), `resolvidas` e `rejeitadas`                                                                                              |
| `GET /api/occurrences/:id`                                              | autor ou staff | Detalhe + histórico + `photoUrl` + referência da original                                                                                                                                            |
| `POST /api/occurrences/:id/cancel`                                      | autor          | Só se estiver RECEBIDA (RF20)                                                                                                                                                                        |
| `GET /api/map/occurrences?bbox=&category=&status=`                      | autenticado    | Pinos públicos **sem dados do autor** (RF15, RNF24); exclui ANULADA                                                                                                                                  |
| `GET /api/map/occurrences/:id`                                          | autenticado    | Detalhe público sem autor                                                                                                                                                                            |
| `GET /api/occurrences?q=&status=&category=&from=&to=&bbox=&sort=&page=` | GESTOR/ADMIN   | `q` pesquisa referência, morada e descrição                                                                                                                                                          |
| `PATCH /api/occurrences/:id/category`                                   | GESTOR/ADMIN   | `{ categoryId }` (RF07)                                                                                                                                                                              |
| `POST /api/occurrences/:id/status`                                      | GESTOR/ADMIN   | `{ status, note?, reason? }` (RF06, RF08)                                                                                                                                                            |
| `POST /api/occurrences/:id/duplicate`                                   | GESTOR/ADMIN   | `{ originalId }` (RF09)                                                                                                                                                                              |
| `GET /api/stats/dashboard?from=&to=`                                    | GESTOR/ADMIN   | Ver secção 9 (RF17)                                                                                                                                                                                  |

---

## 6. Sistema visual (DIA) — usar EXATAMENTE

**Cores (tokens):**

| Token                                | Hex                                   | Uso                                                                                      |
| ------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| azul-sinaliza                        | #1A2B4C                               | texto principal, barras superior e de navegação, botão primário                          |
| amarelo-sinalizacao                  | #FFC107                               | botão «Reportar», separador ativo, pino «nova» — **sempre com azul, nunca texto branco** |
| ambar-escuro                         | #B45309                               | ícones/texto de aviso em fundo claro; «Passo X de 4»                                     |
| branco                               | #FFFFFF                               | fundo                                                                                    |
| cinza-claro                          | #F4F5F7                               | fundo secundário                                                                         |
| cinza-texto                          | #4B5563                               | texto secundário                                                                         |
| cinza-contorno                       | #6B7280                               | contorno de campos                                                                       |
| cinza-divisoria                      | #D1D5DB                               | divisórias (nunca texto)                                                                 |
| estado/recebida                      | #4B5563                               |                                                                                          |
| estado/em-analise                    | #1565C0                               |                                                                                          |
| estado/em-resolucao                  | #B45309                               |                                                                                          |
| estado/resolvida                     | #2E7D32                               | também sucesso                                                                           |
| estado/rejeitada                     | #C62828                               | também erro                                                                              |
| estado/duplicada                     | #546E7A                               |                                                                                          |
| estado/anulada                       | #6B7280                               | só no backoffice                                                                         |
| superficie amarelo/erro/sucesso/info | #FFF8E1 / #FDECEA / #EAF4EA / #E8F0FB | fundos de avisos e da seleção                                                            |
| pressionado azul/amarelo/vermelho    | #12203A / #E0A800 / #A31F1F           | estados _pressed_                                                                        |

**Tipografia:** Poppins SemiBold só nos títulos de ecrã (24/32; 28/36 na web). Inter no resto:

| Estilo        | Peso      | Tamanho/entrelinha |
| ------------- | --------- | ------------------ |
| H2            | Semi Bold | 20/28              |
| H3            | Semi Bold | 17/24              |
| Corpo         | Regular   | 16/24              |
| Corpo pequeno | Regular   | 14/20              |
| Botão         | Semi Bold | 16/24              |
| Rótulo        | Medium    | 14/20              |
| Legenda       | Regular   | 12/16              |
| Legenda forte | Semi Bold | 12/16              |

O tamanho mínimo é 12. Na app, respeita a escala de texto do sistema (`allowFontScaling`) até 200 %.

**Grelha e espaçamento:** sistema de 8 pt (4, 8, 12, 16, 24, 32, 48, 64).

- Mobile: base **360 × 780 dp**, 4 colunas, margens de 16 e goteira de 16.
- Web: menu lateral fixo de 240 px, 12 colunas, margens de 32 e goteira de 24, responsivo de 1024 a 1920 px.
- Raios: 8 em campos e botões, 12 em cartões e diálogos, total em filtros e etiquetas.
- **Áreas tocáveis ≥ 48 × 48 dp** (os filtros têm 36 de altura visível, mas a área tocável é de 48, com `hitSlop`).

**Iconografia:** Lucide (`lucide-react-native` e `lucide-react`), 24 px, traço de 2.

**Componentes:**

- Botão: Primário, Destaque, Secundário, Destrutivo e Texto, cada um com os estados normal, pressionado, desativado e a carregar (_spinner_ + texto).
- Campo de texto, com rótulo sempre visível, 48 px, e erro junto ao campo com ícone e texto.
- Área de texto com contador.
- Filtro (_chip_) com visto quando selecionado.
- Etiqueta de estado: cor + ícone + texto. Ícones por estado: recebida `clock`, em análise `search`, em resolução `flag`, resolvida `circle-check`, rejeitada `x`, duplicada `copy`, anulada `ban`.
- Opção de categoria (56 px, contorno azul de 2 px + visto quando selecionada).
- Indicador de passos («Passo X de 4» + barra de 4 segmentos).
- Aviso (erro, atenção, sucesso, informação; com barra lateral de 4 px).
- Mensagem (_snackbar_).
- Diálogo de confirmação (destrutivo ou neutro).
- Cartão de ocorrência.
- Item de histórico (concluído, atual, pendente).
- Pino do mapa com a cor do estado.
- Barra superior azul de 56 com voltar ou fechar de 48 × 48.
- Barra de navegação inferior **azul**, com 64 de altura e 4 separadores: Mapa, Reportar (pílula amarela com «+»), Minhas e Perfil. O separador ativo fica amarelo com um fundo realçado de 12 % branco.

**Acessibilidade (RNF12–RNF18):**

- contraste AA em tudo;
- a informação nunca depende só da cor;
- `accessibilityLabel` e `accessibilityRole` em todos os elementos interativos, ícones e imagens;
- foco visível na web;
- _feedback_ para todas as ações;
- confirmação antes de ações irreversíveis;
- textos simples em PT-PT.

**Logótipo:** pino de mapa (metade esquerda amarela, metade direita azul) com um triângulo de aviso amarelo e «!» azul, envolvido por um anel em órbita azul. À direita, a palavra «SINALIZA» em Poppins Bold e a assinatura «Reporte, Acompanhe, Resolva!». Cria-o como **SVG** em `packages/shared/assets/logo.svg` e `logo-symbol.svg`. Se existir `assets/logo_sinaliza.png` na raiz, usa-o como referência e no ícone da app.

**Protótipo de referência no Figma** (se tiveres o MCP do Figma ligado, usa `get_design_context` nestes nós; se não, segue as descrições da secção 7). Ficheiro `TzLp0lb63Gh8P1a032rR7R`, página «📱 Protótipo»:

| Ecrã              | Nó                  | Ecrã                       | Nó                      |
| ----------------- | ------------------- | -------------------------- | ----------------------- |
| A01 Abertura      | 5:8                 | A11 Localização a obter    | 9:847                   |
| A02 Login         | 5:37                | A12 Localização confirmada | 9:937                   |
| A03 Erro de login | 5:105               | A13 Fora do concelho       | 9:1033                  |
| A05 Mapa          | 6:207               | A14 Rever                  | 9:1141                  |
| A06/A07 Passo 1   | 7:483 / 7:554       | A16 Enviada                | 9:1367                  |
| A08–A10 Passo 2   | 7:630, 7:756, 7:898 | B01 Minhas                 | 10:1280                 |
| B02 Vazio         | 10:1673             | B03 Detalhe                | 10:1749                 |
| B04 Resolvida     | 10:1880             | B05 Após anular            | 10:2019                 |
| C01 Criar conta   | 11:1998             | C02 Recuperar              | 11:2063                 |
| C04 Perfil        | 11:2146             | D1/D2/D3 Diálogos          | 9:1412, 9:1446, 9:1467  |
| D4 Painel do mapa | 6:520               | Componentes                | página «🧩 Componentes» |

---

## 7. App Mobile do Cidadão — `apps/mobile` (Expo + React Native + TypeScript)

**Stack:**

- Expo (SDK estável mais recente), Expo Router _ou_ React Navigation (pilha nativa + separadores com barra personalizada);
- `@tanstack/react-query`, `zustand` (rascunho da ocorrência), `react-hook-form` + `zod`, `axios` com _interceptor_ de _refresh_;
- `expo-secure-store` (tokens), `expo-location`, `expo-image-picker`, `expo-image-manipulator` (comprimir para ≤ 2 MB e ≤ 1600 px antes de enviar — RNF20);
- `react-native-maps` com `UrlTile` do OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, atribuição «© colaboradores do OpenStreetMap» visível);
- `@expo-google-fonts/poppins` e `@expo-google-fonts/inter`, `lucide-react-native`.

Tem de correr no **Expo Go** (Android e iOS) sem _dev build_. O URL da API é configurável em `EXPO_PUBLIC_API_URL` (o IP local do PC para testar no telemóvel, ex.: `http://192.168.1.50:8080/api`). Documenta isto no README.

**Navegação e comportamento:**

- **Fixos:** barra de estado, barra superior, barra de ações do assistente e barra de navegação inferior.
- **Com _scroll_:** só o conteúdo, com `SafeAreaView` e `KeyboardAvoidingView` nos formulários.
- Os separadores (Mapa, Reportar, Minhas, Perfil) estão sempre visíveis nas áreas principais. «Reportar» abre o assistente em modal de ecrã inteiro (sem barra de navegação).

**Ecrãs:**

1. **A01 · Abertura:** logótipo centrado e «A carregar…». Verifica a sessão guardada e segue para o Mapa ou para Iniciar sessão.
2. **A02–A04 · Iniciar sessão:**
   - Campos e ligações: email, palavra-passe (com mostrar/ocultar), «Esqueci-me da palavra-passe», botão «Entrar» e «Ainda não tem conta? Criar conta».
   - Erro 401: aviso no topo «Email ou palavra-passe incorretos. Verifique os dados e tente novamente.», o campo da palavra-passe fica em erro e o foco passa para esse campo.
   - Durante o pedido: botão «A entrar…» e campos desativados.
3. **C01 · Criar conta:** nome, email e palavra-passe (com ajuda «Mínimo 8 caracteres, com letras e números»). Texto de privacidade: «Os seus dados nunca são mostrados no mapa público.» Em caso de sucesso, volta a Iniciar sessão com a mensagem «Conta criada. Já pode iniciar sessão.»
4. **C02/C03 · Recuperar palavra-passe:**
   - Ecrã com o email e o botão «Enviar ligação».
   - Depois do envio, mostra o aviso de sucesso «Enviámos uma ligação para {email}…» e o botão «Voltar a iniciar sessão».
   - A ligação do email abre a página pública do backoffice `/redefinir-palavra-passe?token=`.
5. **A05 · Mapa (página inicial):**
   - Mapa centrado em Barcelos (41,5317, −8,6194, zoom 13), com o **limite do concelho** desenhado (linha azul tracejada).
   - Cabeçalho flutuante «Ocorrências em Barcelos · N ocorrências visíveis · toque num pino».
   - Filtros por categoria: Todas, Iluminação, Vias, Resíduos, … (_scroll_ horizontal).
   - Pinos com a cor do estado.
   - **Legenda** fixa (Recebida, Em Análise, Em Resolução, Resolvida).
   - Tocar num pino abre o **painel inferior (D4)**: ícone e nome da categoria, morada, etiqueta de estado, «Há 3 dias · SIN-…», fotografia, descrição e «Por privacidade, não é mostrado quem reportou a ocorrência.», com o botão «Fechar».
6. **Assistente «Nova ocorrência»:** barra superior com «X» (abre o diálogo **D1** «Descartar a ocorrência?»), indicador «Passo X de 4» e barra de ações fixa com «Voltar» e «Continuar».
   - **Passo 1 · Fotografia (opcional):**
     - zona vazia «Ainda sem fotografia»;
     - botões «Tirar fotografia» e «Escolher da galeria» (pede as permissões com explicação);
     - pré-visualização + aviso «Fotografia adicionada (X MB, comprimida para envio).» + «Remover fotografia»;
     - «Saltar» e «Continuar» (este fica desativado sem fotografia).
   - **Passo 2 · Categoria e descrição:**
     - lista de categorias (ícone, nome e indicador de seleção);
     - área de texto «Descrição» (10–500 caracteres) com contador e o _placeholder_ «Descreva o problema (ex.: candeeiro apagado junto à passadeira)»;
     - ao tocar em «Continuar» com erros: aviso «Corrija os campos assinalados para continuar.», «Escolha uma categoria.» e «Escreva pelo menos 10 caracteres.»; o botão fica desativado até corrigir.
   - **Passo 3 · Localização:**
     - pede a permissão e mostra «A obter a sua localização…» com um esqueleto de morada;
     - mapa com o pino **arrastável** e a morada obtida por _reverse geocoding_;
     - chama `/locations/validate`: dentro do concelho mostra o aviso de sucesso «Localização confirmada dentro do concelho de Barcelos.»; fora mostra o aviso de erro «Esta localização está fora do concelho de Barcelos. O Sinaliza só aceita ocorrências dentro do concelho.», desativa «Continuar» e mostra o botão «Usar a minha localização»;
     - se o GPS for recusado, permite escolher no mapa.
   - **Passo 4 · Rever e submeter:**
     - fotografia, Categoria / Descrição / Localização, cada uma com «Editar» (volta ao passo respetivo e regressa aqui);
     - aviso de informação «Depois de submeter, vai receber um email sempre que o estado da ocorrência mudar.»;
     - «Submeter» → «A enviar…»: envia a fotografia, depois cria a ocorrência; em caso de erro de rede mostra uma mensagem de erro e permite tentar de novo sem perder o rascunho.
   - **A16 · Ocorrência enviada:**
     - ícone de sucesso, «Ocorrência enviada!», «Obrigado, {nome}…»;
     - cartão com a referência e a etiqueta «Recebida»;
     - aviso «Enviámos uma confirmação para {email}.»;
     - «Ver a ocorrência» e «Voltar ao mapa». O rascunho é limpo.
7. **B01 · As minhas ocorrências:**
   - filtros Todas, Em curso, Resolvidas e Rejeitadas (_scroll_ horizontal);
   - contador «N ocorrências»;
   - cartões com ícone, categoria, morada, etiqueta de estado e «SIN-… · data»;
   - _pull-to-refresh_ e paginação infinita;
   - **estado vazio (B02):** ícone, «Sem ocorrências rejeitadas» (texto adaptado ao filtro), explicação e «Ver todas as ocorrências»;
   - estado de carregamento com esqueletos e estado de erro com «Tentar novamente».
8. **B03/B04 · Detalhe:**
   - fotografia ou «Ocorrência submetida sem fotografia»;
   - etiqueta de estado e referência, título da categoria, morada, descrição, mini-mapa;
   - **Histórico de estados** em linha temporal, com datas, notas, fundamentação da rejeição e «Associada à original SIN-…»;
   - se o estado for RECEBIDA: aviso «Pode anular a ocorrência enquanto estiver no estado «Recebida».» e botão destrutivo «Anular ocorrência», que abre o diálogo **D2** («Anular esta ocorrência?» … «Esta ação não pode ser desfeita.», com «Cancelar» e «Anular») → volta à lista com a mensagem «Ocorrência {ref} anulada.»;
   - noutros estados: botão desativado com «Só é possível anular ocorrências no estado «Recebida».»
9. **C04 · Perfil:**
   - avatar com iniciais (fundo amarelo), nome, «Cidadã/Cidadão · desde {mês ano}»;
   - cartão «Dados pessoais» (nome, email, telemóvel);
   - «Editar dados pessoais» (**C06**: nome e telemóvel; o email está desativado com «O email não pode ser alterado.»);
   - «Alterar palavra-passe» (**C07**: atual, nova e confirmar);
   - «Terminar sessão» abre o diálogo **D3**;
   - depois de guardar: mensagem «Alterações guardadas com sucesso.»

Todos os textos ficam em `apps/mobile/src/i18n/pt-PT.ts`. Todos os erros da API são mapeados para mensagens humanas.

---

## 8. Backoffice Web — `apps/backoffice` (React + Vite + TypeScript)

**Stack:**

- React Router, TanStack Query, react-hook-form + zod;
- Tailwind CSS com os tokens da secção 6, configurados em `tailwind.config` (não uses as cores por omissão);
- Leaflet + react-leaflet com OSM, Recharts (gráficos), `lucide-react`.

Fontes Inter e Poppins. Responsivo de 1024 a 1920 px.

**Layout:** menu lateral azul de 240 px (opções conforme o perfil, com a ativa realçada a amarelo), barra superior com o nome e o perfil do utilizador e «Terminar sessão». **Sessão expira ao fim de 30 min de inatividade** (RNF25), com aviso 1 min antes.

**Páginas:**

1. **Iniciar sessão:** só para GESTOR e ADMIN. Um cidadão que tente entrar vê «Esta área é reservada a gestores municipais.» Inclui «Recuperar palavra-passe» e a página pública **Redefinir palavra-passe** (usada também pelos cidadãos).
2. **Dashboard (página inicial):**
   - cartões de indicadores: total, em curso, resolvidas no período, tempo médio de resolução, taxa de rejeição e de duplicados;
   - gráfico por estado, gráfico por categoria e tendência mensal;
   - tempo médio de resolução por categoria;
   - **mapa de calor / zonas com mais ocorrências** (células H3 ou _grid_);
   - filtro de datas;
   - indicação da fonte de dados: «Databricks · atualizado a …» ou «Base de dados operacional».
3. **Ocorrências:**
   - tabela paginada com referência, categoria, morada, estado (etiqueta), data e dias em aberto;
   - pesquisa e filtros (estado, categoria, intervalo de datas);
   - ordenação; o estado dos filtros fica no URL.
4. **Detalhe da ocorrência:**
   - fotografia (ampliável), dados, mapa e histórico;
   - **ações conforme o estado** (só mostra as transições válidas):
     - «Validar» (→ Em Análise);
     - «Rejeitar» (diálogo com fundamentação obrigatória, mínimo 10 caracteres);
     - «Iniciar resolução» (→ Em Resolução, com nota opcional);
     - «Marcar como resolvida»;
     - «Marcar como duplicada» (diálogo para pesquisar e escolher a original, com pré-visualização);
     - «Alterar categoria»;
   - ações irreversíveis com confirmação;
   - mensagens de sucesso e erro.
5. **Mapa de ocorrências:** Leaflet com _clusters_, filtros de estado e categoria e o limite do concelho; o _popup_ tem uma ligação para o detalhe.
6. **Categorias (ADMIN):** lista, criar, editar, desativar e ativar (o ícone escolhe-se de uma lista Lucide).
7. **Gestores municipais (ADMIN):** lista, criar conta (palavra-passe temporária gerada e mostrada uma vez), editar, desativar e ativar.
8. **Perfil:** alterar dados e palavra-passe.

---

## 9. Bases de Dados Avançadas — Databricks (`analytics/`)

Objetivo: transformar os dados operacionais numa arquitetura **Lakehouse (Delta Lake, medalhão Bronze → Silver → Gold)** que alimenta o dashboard (RF17). Tem de funcionar no **Databricks Free Edition** (ou Community/trial) com **Unity Catalog** (catálogo `sinaliza`, schemas `bronze`, `silver`, `gold`, volume `sinaliza.bronze.landing`).

1. **`analytics/generator/`** (Python 3.11 + Faker + Shapely + Pandas):
   - gera ~20 000 ocorrências sintéticas de 2024-01-01 até hoje, **dentro do polígono de Barcelos**;
   - concentra-as em _hotspots_ (centro da cidade, Barcelinhos, zonas industriais);
   - aplica sazonalidade por categoria (iluminação ↑ no inverno, resíduos ↑ no verão e em feiras às quintas-feiras, vias ↑ depois de chuva no outono e inverno);
   - percorre a máquina de estados com tempos realistas por categoria (iluminação 3–10 dias, vias 7–30 dias, …), ~8 % rejeitadas, ~5 % duplicadas e ~2 % anuladas;
   - produz `occurrences.parquet`, `status_history.parquet` e `categories.parquet`;
   - opção `--load-postgres` para inserir também na `occurrence_db` (para o backoffice ter dados de demonstração).
2. **`analytics/export/`:** script que exporta as tabelas da `occurrence_db` e da `municipal_db` para Parquet (incremental por `updated_at`) e as carrega no volume com o Databricks SDK/CLI (`DATABRICKS_HOST`, `DATABRICKS_TOKEN`).
3. **`analytics/notebooks/`** (formato _source_ `.py` com `# Databricks notebook source` e `# COMMAND ----------`; texto explicativo em PT-PT em células `%md`):
   - `00_setup` — catálogo, schemas, volume e permissões.
   - `01_bronze_ingestao` — **Auto Loader** (`cloudFiles`) do volume para tabelas Delta bronze, com metadados de ingestão (`_ingested_at`, `_source_file`) e _schema evolution_.
   - `02_silver_limpeza`:
     - tipos, deduplicação por `id` e último `updated_at` (**MERGE INTO**);
     - _constraints_ (`CHECK status IN (…)`, `NOT NULL`);
     - coordenadas validadas, **índice H3** com `h3_longlatash3(lng, lat, 9)`;
     - tabela `silver.status_history` ordenada;
     - **Change Data Feed** ativo.
   - `03_gold_indicadores`, com as tabelas:
     - `gold.kpi_diario` (contagens por dia, estado e categoria);
     - `gold.tempo_resolucao` (média, mediana, p90 por categoria e mês, com _window functions_);
     - `gold.hotspots_h3` (contagem por célula H3, com centróide via `h3_centerasgeojson`);
     - `gold.tendencia_mensal`;
     - `gold.taxas` (rejeição e duplicados por categoria);
     - `gold.backlog` (ocorrências em aberto por antiguidade).
   - `04_otimizacao_e_governanca`:
     - `OPTIMIZE` + **Liquid Clustering** (ou `ZORDER BY`) em `silver.occurrences` por (`category_slug`, `created_date`);
     - `VACUUM`;
     - **Time Travel** (`VERSION AS OF`, `DESCRIBE HISTORY`);
     - comparação de desempenho antes e depois;
     - comentários e _tags_ nas tabelas;
     - _grants_ de leitura nas tabelas gold.
   - `05_consultas_dashboard` — consultas SQL usadas pelo backoffice e um dashboard Databricks (AI/BI) opcional.
4. **`analytics/databricks.yml`** (Databricks Asset Bundle) com um **Job** que corre 01 → 02 → 03 diariamente.
5. **Ligação ao backoffice:** o `occurrence-service` expõe `/stats/dashboard` com duas fontes, mais a resposta `source` (`databricks` ou `postgres`) e `updatedAt`, mostrada no dashboard:
   - `ANALYTICS_SOURCE=databricks` → consulta as tabelas gold através da **Databricks SQL Statement Execution API** (`DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_WAREHOUSE_ID`), com cache de 10 min;
   - `ANALYTICS_SOURCE=postgres` (por omissão, para funcionar sem Databricks) → as mesmas métricas calculadas com **vistas SQL / vistas materializadas** na `occurrence_db`.
6. `analytics/README.md` com o passo a passo: criar a conta, gerar o token, criar o SQL warehouse, correr o gerador, carregar os dados, fazer o deploy do bundle e configurar o `.env`.

---

## 10. Dados de demonstração (seed)

Contas (documenta-as no README):

| Perfil  | Email                    | Palavra-passe |
| ------- | ------------------------ | ------------- |
| ADMIN   | admin@sinaliza.pt        | Admin12345    |
| GESTOR  | gestor@sinaliza.pt       | Gestor12345   |
| CIDADAO | maria.fernandes@email.pt | Cidada12345   |

Ocorrências da Maria, iguais às do protótipo:

- SIN-2026-00482, Iluminação pública, Rua Dr. Manuel Pais, RECEBIDA, «O candeeiro junto à passadeira está apagado há uma semana. À noite a passadeira fica sem iluminação.»
- SIN-2026-00451, Vias e pavimento, Rua D. António Barroso, EM_RESOLUCAO, com histórico.
- SIN-2026-00397, Resíduos e limpeza, Largo da Porta Nova, RESOLVIDA, com histórico completo.
- SIN-2026-00310, Passeios e acessibilidade, Av. dos Combatentes, DUPLICADA da SIN-2026-00287.

Junta mais ~40 ocorrências de outros cidadãos espalhadas por Barcelos, para o mapa e o dashboard terem conteúdo. O seed corre com `pnpm seed` e é idempotente.

---

## 11. Qualidade e testes

- ESLint + Prettier + `tsc --noEmit` em todos os pacotes; `pnpm lint`, `pnpm typecheck` e `pnpm test` na raiz.
- **Testes unitários (Jest):**
  - máquina de estados (todas as transições válidas e inválidas);
  - validação das palavras-passe;
  - geração da referência;
  - permissões RBAC;
  - mapeamento de eventos;
  - formatação dos emails.
- **Testes de integração/e2e da API** (Supertest, contra o docker compose ou com Testcontainers), cobrindo:
  - registo, login, _refresh_;
  - criar uma ocorrência dentro e fora do concelho (422);
  - upload de fotografia;
  - anular (só se estiver RECEBIDA);
  - o cidadão não vê ocorrências de outros (403/404);
  - o mapa não devolve dados do autor;
  - o gestor rejeita sem fundamentação (400) e com fundamentação (200);
  - marcar duplicada;
  - o admin cria uma categoria e um gestor;
  - o gestor não acede a `/users` (403);
  - o evento chega ao Mailpit (consulta a API do Mailpit).
- **Frontend:** testes dos componentes principais (Testing Library) e um _smoke test_ da navegação.
- **Script `scripts/verificar.sh`:** sobe o compose, espera pelos _healthchecks_, corre o seed e os testes e2e e imprime um resumo ✅/❌ por requisito (RF01–RF20).

---

## 12. Cloud (RNF10) e documentação

- `docker-compose.yml` (local) e `docker-compose.cloud.yml` (_override_), com **Caddy** a fazer TLS automático para `api.<dominio>` → gateway e `backoffice.<dominio>` → backoffice. Para um domínio grátis podes usar `<ip>.sslip.io`.
- `docs/DEPLOY.md`: passo a passo numa VM Linux (ex.: Azure for Students ou outra VPS) com Docker. Inclui a configuração do `.env` de produção, os segredos, o SMTP real (SendGrid ou Mailtrap), o MinIO com um _endpoint_ público e as cópias de segurança do PostgreSQL (`pg_dump` agendado).
- **`README.md` na raiz:**
  - visão geral e diagrama de arquitetura (Mermaid);
  - requisitos, como arrancar em 3 comandos, contas de teste e URLs (Swagger, RabbitMQ, MinIO, Mailpit);
  - como correr a app no telemóvel com o Expo Go;
  - estrutura de pastas;
  - tabela de **rastreabilidade RF/RNF → serviço/endpoint/ecrã**.
- `docs/ARQUITETURA.md`: decisões, contratos de eventos, modelo de dados (diagramas ER em Mermaid), máquina de estados (diagrama Mermaid) e sequência «reportar ocorrência» (diagrama de sequência Mermaid).

---

## 13. Estrutura do repositório

```
sinaliza/
├─ apps/
│  ├─ mobile/                 # Expo (cidadão)
│  └─ backoffice/             # React + Vite (gestor/admin)
├─ services/
│  ├─ api-gateway/
│  ├─ identity-service/
│  ├─ occurrence-service/
│  ├─ municipal-service/
│  └─ notification-service/
├─ packages/
│  ├─ shared/                 # tipos, enums (estados, perfis), contratos de eventos, DTOs partilhados, assets (logo)
│  └─ config/                 # eslint, tsconfig, prettier partilhados
├─ analytics/                 # generator/, export/, notebooks/, databricks.yml, README.md
├─ infra/
│  ├─ postgres/init/          # criação das 3 BDs, utilizadores e extensões PostGIS
│  ├─ geo/barcelos.geojson
│  ├─ caddy/Caddyfile
│  └─ keys/                   # gerar chaves RSA via script (não commitar a privada)
├─ scripts/                   # gerar-chaves.sh, verificar.sh, seed
├─ docs/                      # ARQUITETURA.md, DEPLOY.md, DECISOES.md, PROGRESSO.md, api/
├─ docker-compose.yml
├─ docker-compose.cloud.yml
├─ .env.example
├─ CLAUDE.md
└─ README.md
```

---

## 14. Fases (segue por esta ordem; testa e faz commit no fim de cada uma)

| Fase | Conteúdo                                                                                                                  | Critério de conclusão                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| F0   | Monorepo pnpm, `packages/config`, `packages/shared`, `CLAUDE.md`, `PROGRESSO.md`, git init                                | `pnpm install`, `pnpm lint` e `pnpm typecheck` passam                                 |
| F1   | Infraestrutura no compose (postgis + init, rabbitmq, minio + bucket, mailpit), script de chaves RSA, `.env.example`       | todos os contentores ficam _healthy_                                                  |
| F2   | identity-service (auth, utilizadores, eventos, Swagger, testes)                                                           | e2e de auth passam                                                                    |
| F3   | municipal-service (categorias, município + limite de Barcelos)                                                            | seed e endpoints funcionam                                                            |
| F4   | occurrence-service (ocorrências, máquina de estados, PostGIS, MinIO, Nominatim, mapa, estatísticas via Postgres, eventos) | e2e de ocorrências passam                                                             |
| F5   | notification-service (consumidores, templates, retries, DLQ)                                                              | os emails aparecem no Mailpit                                                         |
| F6   | api-gateway (proxy, JWT, RBAC, CORS, rate limit, docs agregadas)                                                          | toda a API funciona via :8080                                                         |
| F7   | Seed completo + `scripts/verificar.sh`                                                                                    | resumo com tudo ✅                                                                    |
| F8   | Backoffice completo                                                                                                       | build sem erros; fluxo do gestor e do admin testado contra a API real                 |
| F9   | App mobile completa                                                                                                       | `npx expo start` sem erros, typecheck ok, fluxo completo do cidadão contra a API real |
| F10  | Analytics/Databricks (gerador, export, notebooks, bundle, fonte `databricks` no dashboard)                                | gerador e export correm localmente; notebooks válidos                                 |
| F11  | Cloud (Caddy, `docker-compose.cloud.yml`, `DEPLOY.md`) + README + `ARQUITETURA.md`                                        | documentação completa                                                                 |
| F12  | Verificação final                                                                                                         | `pnpm lint`, `typecheck`, `test` e `verificar.sh` passam; `PROGRESSO.md` atualizado   |

---

## 15. Rastreabilidade obrigatória (verifica no fim)

| Req.                                                                                     | Onde                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF01 Registo e autenticação                                                              | identity · A02–A04, C01, login do backoffice                                                                                                                                        |
| RF02 RBAC                                                                                | gateway + guards em cada serviço                                                                                                                                                    |
| RF03 Registar ocorrência                                                                 | occurrence · assistente de 4 passos                                                                                                                                                 |
| RF04 As minhas ocorrências                                                               | `/occurrences/mine` · B01                                                                                                                                                           |
| RF05 Email a cada mudança de estado                                                      | eventos → notification-service                                                                                                                                                      |
| RF06 Validar/rejeitar com fundamentação                                                  | `/status` · detalhe no backoffice                                                                                                                                                   |
| RF07 Alterar categoria                                                                   | `/category` · backoffice                                                                                                                                                            |
| RF08 Ciclo de vida (Recebida, Em Análise, Em Resolução, Resolvida, Rejeitada, Duplicada) | máquina de estados                                                                                                                                                                  |
| RF09 Duplicada → original                                                                | `/duplicate`                                                                                                                                                                        |
| RF10 Admin gere categorias e gestores                                                    | municipal + identity · backoffice                                                                                                                                                   |
| RF11 Mapas e geolocalização                                                              | OSM + Nominatim · A05, passo 3, mapa do backoffice                                                                                                                                  |
| RF12 Validar dentro de Barcelos                                                          | PostGIS `ST_Contains` · A13                                                                                                                                                         |
| RF13 Recuperar palavra-passe                                                             | identity + email · C02/C03 + página web                                                                                                                                             |
| RF14 Detalhe e histórico                                                                 | B03/B04                                                                                                                                                                             |
| RF15 Mapa público sem autor                                                              | `/map/*` · A05/D4                                                                                                                                                                   |
| RF16 Pesquisa e filtros (gestor)                                                         | `/occurrences` · backoffice                                                                                                                                                         |
| RF17 Dashboard                                                                           | `/stats/dashboard` (Databricks ou Postgres)                                                                                                                                         |
| RF18 Perfil                                                                              | `/users/me` · C04/C06/C07                                                                                                                                                           |
| RF19 Rever antes de submeter + referência                                                | passo 4 + A16                                                                                                                                                                       |
| RF20 Anular enquanto Recebida                                                            | `/cancel` · B03 + D2                                                                                                                                                                |
| RNF01–RNF11                                                                              | secção 2                                                                                                                                                                            |
| RNF12–RNF25                                                                              | secções 6, 7 e 8 (acessibilidade, ≥ 48 dp, PT-PT, desempenho < 3 s, fotografias ≤ 2 MB, Android 10+/iOS 16+, browsers recentes, 360–430 dp, RGPD, palavras-passe, sessão de 30 min) |

**Começa agora pela F0. Quando terminares tudo, mostra-me:**

- o resumo final;
- os comandos para arrancar;
- as contas de teste;
- os URLs;
- o resultado de `scripts/verificar.sh`.
