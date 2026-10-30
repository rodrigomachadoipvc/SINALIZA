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
