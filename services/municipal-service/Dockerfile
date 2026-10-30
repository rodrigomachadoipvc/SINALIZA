# syntax=docker/dockerfile:1
# Build context: repository root (see docker-compose.yml).

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/service-kit/package.json packages/service-kit/
COPY services/municipal-service/package.json services/municipal-service/
RUN pnpm install --frozen-lockfile --filter municipal-service...
COPY packages/ packages/
COPY services/municipal-service/ services/municipal-service/
RUN pnpm --filter @sinaliza/shared build \
 && pnpm --filter @sinaliza/service-kit build \
 && pnpm --filter municipal-service build \
 && pnpm --filter municipal-service deploy --prod --legacy /out \
 && cp -r services/municipal-service/dist /out/dist

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --chown=node:node infra/geo/barcelos.geojson ./geo/barcelos.geojson
ENV MUNICIPALITY_GEOJSON_PATH=/app/geo/barcelos.geojson
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
# Applies pending migrations, then starts the API.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
