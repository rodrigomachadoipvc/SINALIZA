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
