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
