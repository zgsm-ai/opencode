# Stage 1: Build the Vite app - use BUILDPLATFORM for native execution (build output is platform-independent)
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace root config files
COPY package.json bunfig.toml bun.lock ./
COPY patches ./patches

# Copy all workspace package.json files for dependency resolution
COPY packages/app/package.json ./packages/app/
COPY packages/sdk/js/package.json ./packages/sdk/js/
COPY packages/ui/package.json ./packages/ui/
COPY packages/util/package.json ./packages/util/
COPY packages/slack/package.json ./packages/slack/
COPY packages/plugin/package.json ./packages/plugin/
COPY packages/script/package.json ./packages/script/
COPY packages/opencode/package.json ./packages/opencode/

# Copy source code first, then install dependencies
# (avoids COPY overwriting node_modules installed in packages/app)
COPY packages/app ./packages/app
COPY packages/sdk/js ./packages/sdk/js
COPY packages/ui ./packages/ui
COPY packages/util ./packages/util

# Install all workspace dependencies
RUN bun install

# Build arguments for environment variables
ARG VITE_CLOUD_SERVER_HOST=localhost
ARG VITE_CLOUD_SERVER_PORT=18080
ARG VITE_APP_PORT=3000
ARG VITE_API_PREFIX=

ENV VITE_CLOUD_SERVER_HOST=$VITE_CLOUD_SERVER_HOST
ENV VITE_CLOUD_SERVER_PORT=$VITE_CLOUD_SERVER_PORT
ENV VITE_APP_PORT=$VITE_APP_PORT
ENV VITE_API_PREFIX=$VITE_API_PREFIX

RUN cd /app/packages/app && bun run build

# Stage 2: Production runner with bun (uses target platform automatically)
FROM oven/bun:1-alpine AS runner

# Install gettext for envsubst command (used in entrypoint)
RUN apk add --no-cache gettext

WORKDIR /app/packages/app

# Default environment variables (can be overridden at runtime)
ENV VITE_CLOUD_SERVER_HOST=localhost
ENV VITE_CLOUD_SERVER_PORT=18080
ENV VITE_APP_PORT=3000
ENV VITE_API_PREFIX=
ENV VITE_BASE_PATH=
ENV VITE_APP_URL=http://localhost:3000
ENV VITE_CASDOOR_ENDPOINT=http://localhost:18000
ENV VITE_CASDOOR_CLIENT_ID=
ENV VITE_CASDOOR_APP_NAME=app-built-in
ENV VITE_CASDOOR_ORG_NAME=built-in
ENV VITE_STORE_URL=
ENV VITE_OPENCODE_CLOUD_DEVICE_ID=
ENV VITE_OPENCODE_SERVER_HOST=localhost
ENV VITE_OPENCODE_SERVER_PORT=8080

COPY --from=builder /app/packages/app/dist ./dist
RUN chmod -R 777 ./dist 
COPY --from=builder /app/packages/app/script/server.ts ./script/server.ts
COPY --from=builder /app/packages/app/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "script/server.ts"]
