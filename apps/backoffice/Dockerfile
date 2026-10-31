# syntax=docker/dockerfile:1
# Build context: repository root (see docker-compose.yml).

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/backoffice/package.json apps/backoffice/
RUN pnpm install --frozen-lockfile --filter backoffice...
COPY packages/config/ packages/config/
COPY packages/shared/ packages/shared/
COPY apps/backoffice/ apps/backoffice/
RUN pnpm --filter @sinaliza/shared build && pnpm --filter backoffice build

# Unprivileged image: nginx runs as uid 101 and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine
ENV API_URL=http://localhost:8080/api \
    PHOTO_ORIGIN=http://localhost:9000
COPY apps/backoffice/docker/default.conf.template /etc/nginx/templates/default.conf.template
# The entrypoint only sources .envsh files that are executable.
COPY --chmod=755 apps/backoffice/docker/10-sinaliza-config.envsh /docker-entrypoint.d/10-sinaliza-config.envsh
# public/config.js is in the build too, but nginx serves /config.js from /tmp (see the template).
COPY --from=build /repo/apps/backoffice/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
