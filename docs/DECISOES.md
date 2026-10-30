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
