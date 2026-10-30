# syntax=docker/dockerfile:1
# Build context: repository root (see docker-compose.yml).

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/service-kit/package.json packages/service-kit/
COPY services/api-gateway/package.json services/api-gateway/
RUN pnpm install --frozen-lockfile --filter api-gateway...
COPY packages/ packages/
COPY services/api-gateway/ services/api-gateway/
RUN pnpm --filter @sinaliza/shared build \
 && pnpm --filter @sinaliza/service-kit build \
 && pnpm --filter api-gateway build \
 && pnpm --filter api-gateway deploy --prod --legacy /out \
 && cp -r services/api-gateway/dist /out/dist

FROM node:24-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "dist/main.js"]
