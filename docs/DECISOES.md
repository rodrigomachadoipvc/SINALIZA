# Decisões

Registo das decisões que se afastam da especificação ou resolvem ambiguidades nela.

## D01 — Node 24 LTS em vez de Node 20

**Data:** 2026-10-30 · **Fase:** F0

A especificação pede Node 20 LTS, mas o Node 20 chegou ao fim de vida em abril de 2026 e deixou de
receber correções de segurança. O Node 24 é a versão LTS ativa. Usamos Node 24 localmente
(`.nvmrc`) e nas imagens Docker.

## D02 — TypeScript 6.0 em vez de 7.0

**Data:** 2026-10-30 · **Fase:** F0

O TypeScript 7 (compilador nativo) já está publicado, mas o `typescript-eslint` só suporta
TypeScript `< 6.1`. Fixamos o TypeScript 6.0.3 até o ecossistema acompanhar.

## D03 — Vitest em vez de Jest

**Data:** 2026-10-30 · **Fase:** F0

A especificação pede Jest. O NestJS 12 (versão estável atual) é publicado apenas como ESM, e o Jest
continua a precisar de configuração experimental para ESM. O Vitest tem a mesma API (`describe`,
`it`, `expect`), suporta ESM e TypeScript sem configuração e é o mesmo runner usado no backoffice
(Vite). Usamos Vitest em todos os pacotes TypeScript; os testes e2e da API usam Vitest + Supertest.

## D04 — Máquina de estados em `@sinaliza/shared`

**Data:** 2026-10-30 · **Fase:** F0

A máquina de estados é um módulo puro em `packages/shared/src/state-machine.ts`, em vez de viver só
no `occurrence-service`. Assim o backoffice e a app usam exatamente as mesmas regras para mostrar
apenas as ações válidas (`allowedTransitions`), e o serviço continua a ser quem as impõe.

## D05 — RustFS em vez de MinIO

**Data:** 2026-10-30 · **Fase:** F1

A especificação pede MinIO. A MinIO deixou de publicar imagens Docker gratuitas: `minio/minio` e
`minio/mc` já não existem no Docker Hub, e o repositório comunitário foi arquivado. Usar a última
imagem antiga obrigaria a correr software sem correções de segurança.

Usamos o **RustFS** (`rustfs/rustfs`, Apache 2.0), um armazenamento compatível com S3 pensado como
substituto direto da MinIO: as mesmas portas (API 9000, consola 9001) e a mesma API S3. O bucket
`occurrence-photos` é criado por um contentor de _init_ com a AWS CLI (`storage-init`), em vez do
`minio-mc`. Os serviços falam com o armazenamento através do SDK S3 da AWS e de variáveis `S3_*`,
por isso trocar de fornecedor (MinIO, RustFS, AWS S3) é só mudar o `.env`.

Alternativas consideradas: SeaweedFS (precisa de quatro contentores: master, volume, filer e s3) e
Garage (precisa de configurar o _layout_ do cluster antes de usar).

## D06 — PostGIS 3.6 em vez de 3.4

**Data:** 2026-10-30 · **Fase:** F1

A imagem `postgis/postgis:16-3.4` não é atualizada desde outubro de 2024. Mantemos o PostgreSQL 16
pedido na especificação, mas com a versão do PostGIS que ainda recebe atualizações
(`postgis/postgis:16-3.6-alpine`). As funções usadas (`ST_Contains`, `geography`, GIST) são as
mesmas.

## D07 — Portas configuráveis no `.env`

**Data:** 2026-10-30 · **Fase:** F1

Todas as portas publicadas pela infraestrutura vêm do `.env`, com as da especificação por omissão.
No PC de desenvolvimento do Rodrigo a porta 9001 está ocupada por um serviço do Windows, por isso o
`.env` local usa `S3_CONSOLE_PORT=9011`.

## D08 — Pacote `@sinaliza/service-kit`

**Data:** 2026-10-30 · **Fase:** F2

Os cinco serviços NestJS precisam do mesmo formato de erro, do `x-request-id`, da mesma
`ValidationPipe`, da verificação do JWT, do RBAC e da publicação de eventos. Em vez de copiar esse
código cinco vezes, fica num pacote do workspace (`packages/service-kit`). Cada serviço continua a
ter o seu `Dockerfile`, a sua configuração e a sua base de dados; partilham apenas código de
infraestrutura, não dados nem estado.

## D09 — `POST /auth/refresh` é público

**Data:** 2026-10-30 · **Fase:** F2

A especificação marca o refresh como «autenticado». Mas o refresh serve precisamente para quando o
access token (15 min) já expirou, por isso exigir um access token válido tornava-o inútil. A
autenticação deste pedido é o próprio refresh token: opaco, guardado só como SHA-256, válido uma
única vez (rotativo) e com deteção de reutilização — se um token já usado aparecer outra vez, todas
as sessões desse utilizador são revogadas. O logout continua a exigir o access token.

## D10 — Publicação de eventos sem bloquear o pedido

**Data:** 2026-10-30 · **Fase:** F2

Os eventos são publicados depois de a transação na BD terminar, sem o pedido HTTP esperar pela
confirmação do RabbitMQ. A biblioteca `amqp-connection-manager` guarda as mensagens em memória
enquanto o RabbitMQ está em baixo e envia-as quando volta. O risco que fica é perder eventos se o
serviço for abaixo nesse intervalo. A solução completa seria o padrão _transactional outbox_
(tabela de eventos na mesma transação + processo que os publica); fica como melhoria futura, porque
o efeito de uma falha é apenas um email não enviado.

## D11 — Prisma 7 em vez de Prisma 8

**Data:** 2026-10-30 · **Fase:** F2

A especificação deixa escolher entre Prisma e TypeORM; escolhemos Prisma. O Prisma 8 está publicado
no npm como `latest`, mas a própria documentação ainda o descreve como _release candidate_.
Usamos o Prisma 7.10 (estável, `prisma@prev`), com o gerador ESM `prisma-client` e o adaptador
`@prisma/adapter-pg`. As migrações são SQL versionado em `prisma/migrations/`, aplicadas com
`prisma migrate deploy` quando o contentor arranca.

## D12 — Testes e2e com Testcontainers

**Data:** 2026-10-30 · **Fase:** F2

Os testes e2e de cada serviço arrancam o seu próprio PostgreSQL e RabbitMQ com Testcontainers, em
vez de usarem o `docker compose` de desenvolvimento. Assim os testes não apagam nem dependem dos
dados locais e podem correr em paralelo com a app. Precisam apenas do Docker a correr.

## D13 — Chamadas internas com segredo partilhado

**Data:** 2026-10-30 · **Fase:** F3

O `occurrence-service` precisa de validar categorias e de obter o limite do concelho, inclusive no
arranque, quando não há nenhum utilizador autenticado. Por isso o `municipal-service` expõe rotas
em `/internal/*`, autenticadas pelo cabeçalho `x-internal-token` (variável `INTERNAL_API_TOKEN`,
comparada em tempo constante), em vez de um JWT de utilizador. Estas rotas não aparecem no Swagger
público e o gateway nunca encaminha o prefixo `/internal`. Uma alternativa mais forte seria mTLS
entre serviços; para este projeto, rede Docker interna + segredo partilhado é suficiente.

## D14 — Limite real de Barcelos a partir do OpenStreetMap

**Data:** 2026-10-30 · **Fase:** F3

`infra/geo/barcelos.geojson` é o limite oficial do concelho no OpenStreetMap (relação 3737586,
`admin_level=7`), obtido pelo Nominatim com `polygon_threshold=0.0005` (204 vértices). Não foi
preciso o polígono aproximado de recurso. O `municipal-service` carrega o ficheiro na tabela
`municipality` em cada arranque (insere ou atualiza), com `ST_MakeValid` para garantir um
MultiPolygon válido. Os testes e2e confirmam pontos dentro (Câmara, Barcelinhos) e fora (Braga,
Esposende, Viana do Castelo). Dados © colaboradores do OpenStreetMap, licença ODbL.

## D15 — `GET /categories` devolve uma lista, não uma página

**Data:** 2026-10-30 · **Fase:** F3

A regra geral (RNF19) é paginar as listas. As categorias são poucas (seis por omissão) e as apps
precisam sempre de todas, para os filtros e para o passo 2 do assistente. Paginá-las obrigaria a
pedidos extra sem benefício, por isso este endpoint devolve um array ordenado pelo nome.

## D16 — Sem `processed_events` na `occurrence_db`

**Data:** 2026-10-30 · **Fase:** F4

A especificação lista a tabela `processed_events` (idempotência) na `occurrence_db`. O
occurrence-service só publica eventos; não consome nenhum, por isso a tabela ficaria sempre vazia.
A idempotência é feita por quem consome: o notification-service (F5) guarda os `eventId` já
tratados. Se no futuro o occurrence-service passar a consumir eventos, a tabela entra numa migração.

## D17 — Coordenadas, bbox e colunas geradas

**Data:** 2026-10-30 · **Fase:** F4

- `location` é `geography(Point, 4326)`, como pede a especificação. `lat` e `lng` são colunas
  geradas (`ST_Y`/`ST_X`) e guardadas, para o Prisma conseguir filtrar e ordenar sem SQL bruto.
- O parâmetro `bbox` usa a ordem `oeste,sul,este,norte` (a de `toBBoxString()` do Leaflet e do
  GeoJSON).
- `ST_Contains` corre sobre a cópia local do limite (`boundary_cache`), em `geometry`. Se o
  municipal-service estiver em baixo no arranque, o serviço arranca na mesma e volta a tentar a cada
  15 s; enquanto não houver limite, criar e validar localizações devolve 503.

## D18 — Erros das chamadas ao municipal-service

**Data:** 2026-10-30 · **Fase:** F4

Se o municipal-service não responder (rede ou tempo limite de 5 s), o occurrence-service devolve 503. Se responder com um erro inesperado, devolve 502. Uma categoria que não existe ou está
desativada é um erro do pedido: devolve 422 com o campo `categoryId` nos detalhes.

## D19 — Fotografias: chave por utilizador e reprocessamento

**Data:** 2026-10-30 · **Fase:** F4

`POST /photos` deteta o formato pelo conteúdo (não pelo `Content-Type`), roda a imagem pela
orientação EXIF, remove todos os metadados (incluindo GPS, por privacidade) e grava sempre JPEG,
baixando a qualidade até ficar com 2 MB ou menos. A chave é `uploads/{userId}/{uuid}.jpg`; ao criar
a ocorrência só se aceitam chaves com o prefixo do próprio utilizador e que existam no storage. Os
URLs pré-assinados são assinados com `S3_PUBLIC_ENDPOINT`, porque o endereço interno
(`http://storage:9000`) não é acessível ao browser nem ao telemóvel.

## D20 — Indicadores do dashboard na base operacional

**Data:** 2026-10-30 · **Fase:** F4

`ANALYTICS_SOURCE=postgres` usa a vista `occurrence_facts` (sem anuladas). Definições: totais e
taxas sobre as ocorrências **criadas** no período; «resolvidas no período» e tempo médio de
resolução pela **data de resolução**; dias no calendário de Lisboa. Os _hotspots_ usam uma grelha de
0,005° (~500 m) em vez de H3, porque o H3 não existe no PostgreSQL sem extensões extra; o
Databricks (F10) usará H3. Por omissão o período é o mês atual e os 11 anteriores; o máximo é 5 anos.
A fonte `databricks` entra na F10, atrás da mesma interface `StatsProvider`.

## D21 — Retries com filas de atraso e DLQ

**Data:** 2026-10-30 · **Fase:** F5

O RabbitMQ não tem atrasos nativos sem um plugin. Cada tentativa falhada é republicada numa fila de
atraso (`notification.emails.retry.<n>ms`, com `x-message-ttl`) que, quando o tempo expira, devolve
a mensagem à fila principal através do _dead-letter_ para a exchange por omissão. O número da
tentativa vai no cabeçalho `x-attempt`. Por omissão há 3 tentativas (atrasos de 5 s e 30 s,
configuráveis em `NOTIFICATION_RETRY_DELAYS_MS`). Depois da última, a mensagem vai para
`notification.emails.dlq` com o erro em `x-last-error`. Mensagens ilegíveis vão logo para a DLQ.
O nome de cada fila de atraso inclui o atraso porque os argumentos de uma fila não podem mudar.
Rejeitámos o plugin `rabbitmq_delayed_message_exchange`, porque não vem na imagem oficial.

## D22 — Idempotência em memória e entrega «pelo menos uma vez»

**Data:** 2026-10-30 · **Fase:** F5

Como pede a especificação, os `eventId` tratados ficam numa LRU em memória (10 000 entradas), e os que estão a ser tratados num mapa à
parte, para que uma entrega repetida em paralelo espere pela primeira em vez de enviar outro email.
A mensagem só é confirmada (`ack`) depois de o email ser aceite pelo SMTP. Um reinício entre o
envio e o `ack` pode gerar um email repetido; para um email é um risco aceitável. Uma tabela persistente exigiria dar uma base de dados a este serviço,
que a especificação diz não ter.

## D23 — Serviços sem rotas de utilizador não recebem a chave pública

**Data:** 2026-10-30 · **Fase:** F5

`coreProviders(null)` cria a guarda global sem verificador de JWT: só as rotas `@Public()` (aqui,
`/health`) respondem e todas as outras devolvem 401. Assim o notification-service não precisa da
chave pública do JWT nem de a montar no contentor.

## D24 — O gateway encaminha só as rotas de uma lista explícita

**Data:** 2026-10-30 · **Fase:** F6

`src/routing/routes.ts` lista cada rota pública (método, caminho, serviço e acesso: pública,
autenticada ou perfis). Um pedido que não está na lista recebe 404 no gateway, e um método errado
recebe 405 com `Allow`. Assim `/internal/*` e os `/health` dos serviços nunca são acessíveis de fora.
O RBAC por rota é feito aqui e repetido nos serviços (defesa em profundidade). Para a lista não
divergir dos serviços, um teste unitário compara-a com os specs OpenAPI em `docs/api/`, incluindo
quais rotas são públicas. Rejeitámos encaminhar por prefixo (`/api/occurrences/**` → serviço),
porque deixaria passar qualquer rota nova sem revisão de acesso.

## D25 — Cabeçalhos de identidade e de encaminhamento

**Data:** 2026-10-30 · **Fase:** F6

O gateway apaga sempre os `x-user-*`, o `x-internal-token` e os `X-Forwarded-*`/`Forwarded` que
o cliente enviar. Depois de verificar o JWT escreve os `x-user-*` (o nome vai codificado com
`encodeURIComponent`, porque os cabeçalhos HTTP só aceitam Latin-1) e um `X-Forwarded-For` com um
único IP: o cliente tal como o gateway o vê, segundo `TRUST_PROXY`. Assim um cliente não consegue
falsificar o IP para fugir ao limite de pedidos do login no identity-service. Localmente
`TRUST_PROXY=false`; na cloud passa a confiar só no Caddy.

## D26 — O gateway não lê os corpos dos pedidos

**Data:** 2026-10-30 · **Fase:** F6

O Nest arranca com `bodyParser: false` e o `http-proxy-middleware` (v4, sobre o `httpxy`) passa o
corpo em _stream_. As fotografias (multipart até 5 MB) passam sem cópias em memória, e a validação
dos corpos continua a ser feita só pelos serviços. Erros de ligação dão 503 e tempo esgotado
(`PROXY_TIMEOUT_MS`, 30 s) dá 504, sempre no formato de erro comum.

## D27 — Rate limit no gateway e documentação agregada

**Data:** 2026-10-30 · **Fase:** F6

- `express-rate-limit`: 300 pedidos por minuto por IP em `/api`, em memória (há uma só instância
  do gateway), com cabeçalhos `RateLimit` normalizados. O limite mais apertado do login fica no
  identity-service (D09/F2).
- `/docs` serve o Swagger UI (`swagger-ui-dist`) com um seletor para os quatro specs. Cada spec vem
  do `/docs/openapi.json` do serviço, com cache de 1 min, e é reescrito com o servidor `/api` e só
  as operações que o gateway expõe. O arranque do Swagger UI está num ficheiro `.js` e não em
  _script inline_, para a CSP do `helmet` ficar estrita. O spec do notification-service não tem
  operações públicas; aparece no seletor porque a especificação pede os quatro.

## D28 — Seed das ocorrências direto na base, com utilizadores e categorias lidos pela API

**Data:** 2026-10-30 · **Fase:** F7

- As ocorrências de demonstração precisam de datas, referências e históricos fixos (as da Maria
  iguais às do protótipo). A API não permite criar ocorrências no passado nem escolher a
  referência, por isso o seed do occurrence-service escreve diretamente na `occurrence_db`. Não
  publica eventos, por isso o seed não envia emails.
- Os autores e as categorias pertencem a outros serviços. Para não dar ao seed acesso às bases
  `identity_db` e `municipal_db` (RNF07), o seed lê-os pelo gateway, com o login do administrador
  de demonstração (`SEED_API_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`).
- O seed é idempotente: os ids derivam da referência (UUID v5 sobre SHA-1). Uma referência já usada
  por outra ocorrência é ignorada e listada. O contador de 2026 passa para pelo menos 482, por isso
  a próxima ocorrência real recebe a SIN-2026-00483.
- O seed valida que todos os pontos estão dentro do limite em cache (`ST_Contains`) antes de
  escrever. Um teste unitário faz a mesma verificação contra `infra/geo/barcelos.geojson`.
- Os 10 cidadãos extra usam endereços `@example.com` (domínio reservado, RFC 2606), para que nenhum
  email chegue a uma caixa real se o SMTP da cloud estiver configurado. A conta da Maria mantém o
  endereço da especificação.
- `pnpm seed` corre os dois seeds **dentro dos contentores** (`docker compose exec`), por isso não
  precisa de compilar nada no anfitrião. Cada serviço mantém um script `seed` para correr fora do
  Docker.
- Alternativa rejeitada: criar as ocorrências pela API e mudar os estados como gestor. Era mais
  fiel ao fluxo real, mas todas as datas ficariam iguais ao momento do seed (o dashboard mensal
  ficaria vazio) e o seed enviaria dezenas de emails.

## D29 — `verificar.sh` corre testes de requisitos contra a stack real

**Data:** 2026-10-30 · **Fase:** F7

- Novo pacote `tests/system` (Vitest), fora de `pnpm test`, porque precisa da stack a correr.
  Cada teste começa pelo requisito que cobre (`RF01 · …`). O `summary.ts` agrupa o relatório JSON
  do Vitest numa tabela ✅/❌ de RF01 a RF20, mais uma linha para os dados de demonstração.
- Os testes usam só o gateway em :8080 e a API do Mailpit, como faria um cliente. As contas que
  criam usam o domínio `verificar.sinaliza.test`, e as categorias o prefixo «Verificação ». No fim,
  `cleanup.ts` apaga essas contas e o que delas depende (ocorrências, fotografias no bucket,
  emails). Para isso usa o superutilizador do PostgreSQL do `.env`, porque é uma ferramenta de
  teste e não um serviço. `SINALIZA_KEEP_TEST_DATA=1` mantém os dados para inspeção.
- O login tem um limite de 10 pedidos por minuto por IP. Os testes respeitam o `Retry-After` e
  repetem o pedido uma vez, por isso o script pode ser corrido duas vezes seguidas.
- Por omissão, `verificar.sh` não corre os e2e com Testcontainers dos pacotes, que demoram vários
  minutos e já correm em `pnpm test`. A opção `--completo` acrescenta lint, typecheck e `pnpm test`.
- O passo «rever antes de submeter» do RF19 e os ecrãs são das apps (F8/F9), que terão os seus
  próprios testes. Aqui o RF19 verifica a referência devolvida e que o detalhe coincide com o que
  foi submetido.

## D30 — Tokens de design no `@theme` do Tailwind v4, sem as cores por omissão

**Data:** 2026-10-31 · **Fase:** F8

- O Tailwind v4 já não usa `tailwind.config.js`: o tema define-se em CSS, no bloco `@theme` de
  `apps/backoffice/src/styles.css`. É o equivalente ao «tailwind.config com os tokens» da
  especificação.
- `--color-*: initial` apaga a paleta por omissão. Só existem as classes dos tokens da secção 6
  (`bg-azul`, `text-cinza-texto`, `bg-estado-resolvida`, …), por isso uma cor fora da paleta não
  compila em vez de passar despercebida.
- O Recharts e o Leaflet desenham SVG/canvas e precisam dos valores hexadecimais. Esses valores
  vêm dos mesmos tokens (`STATUS_HEX`, constantes no dashboard). Os clusters do mapa usam só o CSS
  estrutural do plugin; as cores dele (verde/laranja) não estão na paleta.
- Alternativa rejeitada: manter o Tailwind 3 com `tailwind.config.js`. Seria seguir a letra da
  especificação com uma versão antiga.

## D31 — O backoffice lê o endereço da API em runtime (`/config.js`)

**Data:** 2026-10-31 · **Fase:** F8

- A imagem nginx (`nginxinc/nginx-unprivileged`, sem root) gera `/config.js` ao arrancar, a partir
  de `API_URL`, e o `index.html` carrega-o antes da app. Assim a mesma imagem serve local e cloud
  (F11) sem reconstruir. Em desenvolvimento, `VITE_API_URL` sobrepõe-se.
- O script de arranque recusa `API_URL` sem `http(s)://` ou com aspas, `<`, `>`, `;` ou espaços,
  para que o valor não saia da string JavaScript nem do cabeçalho CSP.
- O nginx envia CSP (`script-src 'self'`; `connect-src` só para a origem da API; imagens só do
  próprio site, dos mosaicos OSM e do armazenamento de fotografias), `nosniff`,
  `frame-ancestors 'none'` e cache longa nos ficheiros com hash.
- Alternativa rejeitada: `VITE_API_URL` em tempo de build. Obrigava a uma imagem por ambiente.

## D32 — O browser chama o gateway diretamente (CORS), sem proxy no nginx

**Data:** 2026-10-31 · **Fase:** F8

- A SPA em :8081 faz os pedidos a `http://localhost:8080/api`, que já autoriza esta origem
  (`CORS_ORIGINS`). O gateway continua a ver o IP real do cliente, por isso o limite de pedidos por
  IP e os logs mantêm-se corretos sem configurar `X-Forwarded-For`.
- Os tokens ficam em `sessionStorage`: uma recarga mantém a sessão e fechar o separador termina-a.
  Depois de 30 min sem atividade a sessão termina, com aviso 1 min antes; mexer o rato durante o
  aviso não o fecha, é preciso escolher «Continuar sessão». Um 401 renova o token uma única vez
  (pedidos simultâneos partilham a renovação). Depois de «Terminar sessão» o próximo login começa
  no dashboard; depois de expirar volta à página onde estava.
- O Leaflet e o Recharts são carregados só nas páginas que os usam (`lazy`). O bundle inicial
  passou de 1,1 MB para 376 kB.
- Alternativa rejeitada: um `location /api` no nginx a fazer proxy para o gateway. Evitava o
  CORS, mas todos os pedidos chegariam ao gateway com o IP do nginx, e o limite por IP passaria
  a ser global.

## D33 — App mobile no Expo SDK 57 (e não no 58)

**Data:** 2026-10-31 · **Fase:** F9

- A especificação pede o SDK estável mais recente **e** que a app corra no Expo Go, sem
  _development build_. O SDK 58 saiu a 2026-10-15, mas as notas de lançamento dizem que o Expo Go
  para o 58 só chega às lojas «dentro de algumas semanas». Com o 58, um telemóvel com o Expo Go da
  loja não abria a app.
- O SDK 57 (expo 57.0.31, React Native 0.86, React 19.2) é o mais recente que o Expo Go das lojas
  suporta. Todas as dependências nativas estão nas versões indicadas para o SDK 57
  (`react-native-maps`, `reanimated`, `worklets`, `screens`, …); `pnpm peers check` sem avisos.
- O pnpm com instalações isoladas funciona desde o SDK 54 e o Metro configura o monorepo sozinho
  (SDK 52+), por isso não foi preciso `node-linker=hoisted`.
- Atualizar para o 58 quando o Expo Go estiver nas lojas: `npx expo install expo@^58 --fix`.
- Alternativa rejeitada: SDK 58 com _development build_. Obrigava a instalar Android Studio/Xcode
  para testar, contra o requisito do Expo Go.

## D34 — Cliente, sessão e rascunho na app mobile

**Data:** 2026-10-31 · **Fase:** F9

- **Navegação:** Expo Router com grupos `(auth)`, `(tabs)` e `reportar` (modal de ecrã inteiro).
  A barra inferior é um componente próprio: «Reportar» não é um separador, abre o assistente por
  cima. Os guardas de sessão estão nos `_layout` (sem sessão → login).
- **Pedidos:** axios com dois intercetores. O primeiro junta o `Bearer`; o segundo, num 401,
  renova o token uma vez (pedidos simultâneos partilham a mesma renovação) e repete o pedido. Se a
  renovação falhar, termina a sessão com «A sessão expirou…». Todos os erros passam por
  `toApiError`, que dá sempre uma mensagem em PT-PT (rede, 429, 5xx, 403 ou a mensagem da API).
- **Sessão:** zustand + `expo-secure-store` (Keychain/Keystore). No build web, `sessionStorage`.
  A app recusa contas de gestor/admin no login e revoga logo os tokens delas.
- **Rascunho:** a ocorrência em curso vive num store zustand fora dos ecrãs. Voltar atrás,
  «Editar» na revisão ou um erro de rede no envio não apagam nada; só «Descartar» (D1) e o ecrã de
  confirmação o limpam.
- **Fotografia:** `expo-image-manipulator` reduz para ≤ 1600 px e grava JPEG baixando a qualidade
  (0,8 → 0,35) até ≤ 2 MB; o servidor volta a validar.
- **Mapa:** `react-native-maps` com `mapType="none"` e `UrlTile` dos mosaicos OSM, para não
  depender de chaves do Google/Apple; atribuição «© colaboradores do OpenStreetMap» sempre
  visível.
- **Build web só para verificação:** não há emulador nesta máquina, por isso o fluxo completo foi
  verificado no browser (`pnpm --filter mobile web`, porta 8082, autorizada em `CORS_ORIGINS`).
  `SinalizaMap.web.tsx` usa Leaflet e `token-storage.web.ts` usa `sessionStorage`; o Metro escolhe
  estes ficheiros pela extensão. Os bundles nativos foram compilados com `expo export` (Android e
  iOS) para garantir que o código nativo também compila.
- Alternativa rejeitada: React Navigation configurado à mão. O Expo Router dá as mesmas pilhas e
  separadores com rotas por ficheiro e ligações profundas (`sinaliza://minhas/<id>`) sem código.

## D35 — O lake não recebe dados pessoais dos cidadãos

**Data:** 2026-10-31 · **Fase:** F10

- O export e o gerador escrevem as mesmas colunas (`analytics/common/lake.py`); `write_table`
  recusa colunas a mais. Das ocorrências segue o `citizen_id` (UUID, pseudónimo) e os campos dos
  indicadores; **nunca** o nome, o email nem a descrição escrita pelo cidadão (texto livre, pode
  conter dados pessoais). As fotografias também não: só `has_photo`.
- Os indicadores não precisam de saber quem reportou, e o Databricks é um serviço externo:
  minimização de dados (RGPD, art. 5.º, n.º 1, alínea c)).
- Na gold só há agregados; o grupo de leitores (e o token do `occurrence-service`) só tem
  `SELECT` na gold, e o notebook 04 retira explicitamente acessos à bronze e à silver. As colunas
  pseudónimas e de localização têm _tags_ no Unity Catalog.
- Alternativa rejeitada: copiar as tabelas inteiras e mascarar na silver. Os dados pessoais
  ficariam na bronze (e nos ficheiros do volume) para sempre.

## D36 — Gold com o grão diário que reproduz os números do Postgres

**Data:** 2026-10-31 · **Fase:** F10

- O backoffice aceita qualquer período (`de`/`até`, dias em Europe/Lisbon). Para que a fonte
  `databricks` dê exatamente os mesmos números que a `postgres`, a `gold.kpi_diario` guarda, por
  dia × categoria × estado, as `criadas` (pelo dia de criação e estado atual) e as `resolvidas` com
  a `soma_dias_resolucao` (pelo dia de resolução). Totais, taxas, distribuições, tendência e tempo
  médio somam-se sobre o intervalo; a média é `soma / resolvidas`, nunca uma média de médias.
- Pontos quentes: H3 de resolução 9 na silver e 8 na `gold.hotspots_h3` (~460 m de lado,
  ~0,74 km²), cerca de 3× maior do que as células de 0,005° (~0,23 km²) da `occurrence_facts`.
  É a única diferença entre fontes: no workspace real, para três períodos (um a meio do mês),
  totais, estados, categorias, tendência e tempos de resolução deram exatamente os mesmos números;
  os pontos quentes do Databricks são menos e mais concentrados (o maior junta ~2× mais
  ocorrências). Com a resolução 9 (~0,1 km²) seria o contrário; a 8 serve melhor um concelho de
  ~380 km².
- As restantes tabelas (`tempo_resolucao` com mediana e p90, `tendencia_mensal`, `taxas`,
  `backlog`) servem o notebook 05 e o dashboard AI/BI.
- A gold é recalculada por inteiro em cada execução (`CREATE OR REPLACE`): com dezenas de milhares
  de linhas demora segundos, e o Delta guarda as versões anteriores. O notebook 03 termina com uma
  verificação gold = silver que faz falhar o job se não baterem.
- Alternativa rejeitada: uma tabela gold por mês e categoria. Não permitia períodos que começam a
  meio do mês sem voltar à silver.

## D37 — Silver com MERGE, restrições e quarentena; Liquid Clustering em vez de ZORDER

**Data:** 2026-10-31 · **Fase:** F10

- O export é incremental por `updated_at` e reenvia as linhas da fronteira; a silver usa
  `MERGE INTO … ON id` e só atualiza quando o `updated_at` é mais recente, por isso repetir uma
  carga não muda nada. Só se lê a bronze ingerida depois da última carga (`_ingested_at`).
- Regras de qualidade como restrições Delta (`NOT NULL`, `CHECK` de estado, referência,
  coordenadas no concelho, datas coerentes). Uma linha inválida faria falhar o lote inteiro, por
  isso é desviada antes para `silver.occurrences_quarentena` com o motivo.
- `silver.occurrences` agrupada por `category_slug, created_date` com **Liquid Clustering**
  (notebook 04). O `ZORDER` reescreve todos os ficheiros em cada `OPTIMIZE` e fixa as colunas; o
  Liquid Clustering é incremental, as chaves mudam com um `ALTER TABLE` e é o recomendado pela
  Databricks para tabelas novas. Particionar por dia criaria milhares de ficheiros minúsculos.
- Change Data Feed ligado nas tabelas silver.
- Alternativa rejeitada: Lakeflow Declarative Pipelines (DLT) com _expectations_. Na Free Edition
  só há um pipeline ativo por tipo e a especificação pede notebooks e um job.

## D38 — Fonte `databricks` pela SQL Statement Execution API, com cache

**Data:** 2026-10-31 · **Fase:** F10

- O `occurrence-service` chama `POST /api/2.0/sql/statements` com `fetch` (sem SDK nem driver
  JDBC/ODBC): resultados `JSON_ARRAY` em linha, `wait_timeout` de 50 s com `CANCEL`, parâmetros
  nomeados `DATE` (`:date_from`, `:date_to`) e catálogo/esquema no pedido, por isso o SQL não é
  concatenado. As seis consultas estão em `databricks-queries.ts`; um teste em `analytics/tests`
  garante que são as mesmas do notebook 05.
- Cache por período durante 10 min (`ANALYTICS_CACHE_SECONDS`): a gold muda uma vez por dia e o
  warehouse 2X-Small da Free Edition desliga-se quando parado. Pedidos simultâneos partilham a
  mesma consulta; falhas não ficam em cache; no máximo 100 períodos guardados.
- Se o Databricks falhar, a API responde 502 com mensagem em PT-PT. Não há recurso automático ao
  Postgres: o painel diz sempre de onde vêm os números, e misturar fontes sem aviso esconderia a
  falha. Para voltar à base operacional muda-se `ANALYTICS_SOURCE`.
- Em modo `databricks` o serviço não arranca sem `DATABRICKS_HOST`, `DATABRICKS_TOKEN` e
  `DATABRICKS_WAREHOUSE_ID` (o _host_ tem de ser https).
- Alternativa rejeitada: `@databricks/sql` (Thrift). Mais uma dependência nativa para seis
  consultas agregadas que a API REST resolve.

## D39 — Gerador sintético: modelo explícito, carga transacional e dados removíveis

**Data:** 2026-10-31 · **Fase:** F10

- Python 3.11 com uv (`analytics/pyproject.toml`), versões fixas e `exclude-newer` (só versões
  publicadas há pelo menos dois dias, como o `minimumReleaseAge` do pnpm).
- Todas as hipóteses estão em `generator/model.py` (pesos, sazonalidade, focos, prazos, textos) e
  o mesmo _seed_ dá os mesmos dados. A chuva é uma série simulada (mais húmida no outono e
  inverno) e as vias reagem aos três dias anteriores. As transições seguem a máquina de estados
  real e as ações do gestor caem em horário de expediente; os testes verificam ambas.
- `--load-postgres` faz tudo numa transação: bloqueia `reference_counters`, numera a seguir aos
  contadores, insere com `COPY`, confirma com `ST_Contains` que todos os pontos estão no limite em
  cache e só então faz _commit_. Não publica eventos (não há emails).
- Os cidadãos gerados usam o domínio reservado `gerado.sinaliza.test`; `--purge`/`--replace`
  encontram-nos por ele. O _purge_ repõe cada contador no valor anterior à carga e nunca abaixo:
  números já usados (e enviados por email) não voltam a ser atribuídos.
- Os notebooks não correm fora do Databricks; os testes validam formato, Python (`ast`), SQL no
  dialeto Databricks (`sqlglot`) e o grafo do job.
- Alternativa rejeitada: inserir pela API. Não permite datas passadas nem históricos com dias de
  intervalo, e enviaria milhares de emails.

## D40 — Cloud com um _override_ do compose e Caddy, sem portas além de 80/443

**Data:** 2026-10-31 · **Fase:** F11

- A especificação fala num perfil `cloud` (secção 2) e num `docker-compose.cloud.yml` (secção 12).
  Escolhemos o ficheiro de _override_: um perfil só acrescenta serviços, não consegue fechar as
  portas nem mudar os URLs dos serviços que já existem. Na VM, `COMPOSE_FILE` no `.env` faz com
  que todos os comandos (`up`, `exec`, `pnpm seed`, o backup) usem os dois ficheiros.
- O _override_ usa `!reset`/`!override` (Compose ≥ 2.24): o gateway e o backoffice deixam de
  publicar portas; PostgreSQL, consola do RabbitMQ e consola do armazenamento ficam em
  `127.0.0.1` da VM, para administração por túnel SSH; o Mailpit fica no perfil `local` e não
  arranca.
- Três nomes: `api.`, `backoffice.` e `ficheiros.<domínio>`. As fotografias precisam do seu, porque
  os URLs pré-assinados são assinados para um _host_ e o Caddy passa o `Host` sem o alterar; um
  caminho (`api.<domínio>/ficheiros`) partiria a assinatura. CORS, link de recuperação e URLs das
  fotografias derivam todos de `SINALIZA_DOMAIN`, para não haver quatro sítios a manter iguais.
- `TRUST_PROXY=uniquelocal` no gateway: só endereços privados (o Caddy na rede do Docker) podem
  definir o `X-Forwarded-For`, e o _rate limit_ conta o IP real do cliente.
- Verificado localmente com `SINALIZA_DOMAIN=localhost` (o Caddy usa então a sua CA local): os 22
  testes de requisitos passaram por HTTPS, incluindo a fotografia lida em `ficheiros.localhost`.
- Cópias de segurança com `pg_dump -Fc` por base, num script chamado pelo `cron` do _host_
  (`scripts/backup-postgres.sh`, 14 dias). Rejeitámos um contentor de backup com cron próprio:
  mais uma imagem para manter, e o `cron` do sistema já existe em qualquer VM.
