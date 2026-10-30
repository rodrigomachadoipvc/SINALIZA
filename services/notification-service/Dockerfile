# syntax=docker/dockerfile:1
# Build context: repository root (see docker-compose.yml).

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/service-kit/package.json packages/service-kit/
COPY services/notification-service/package.json services/notification-service/
RUN pnpm install --frozen-lockfile --filter notification-service...
COPY packages/ packages/
COPY services/notification-service/ services/notification-service/
RUN pnpm --filter @sinaliza/shared build \
 && pnpm --filter @sinaliza/service-kit build \
 && pnpm --filter notification-service build \
 && pnpm --filter notification-service deploy --prod --legacy /out \
 && cp -r services/notification-service/dist /out/dist

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
CMD ["node", "dist/main.js"]
