# Shared build for 8Byte monorepo (backend, ws-server, web)
FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace root and all package manifests for install
COPY package.json bun.lock* ./
COPY apps/backend-server/package.json apps/backend-server/
COPY apps/ws-server/package.json apps/ws-server/
COPY apps/web/package.json apps/web/
COPY packages/backend-common/package.json packages/backend-common/
COPY packages/cached-db/package.json packages/cached-db/
COPY packages/common/package.json packages/common/
COPY packages/db/package.json packages/db/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
COPY packages/ws-frontend/package.json packages/ws-frontend/

RUN bun install --frozen-lockfile

# Copy full source
COPY . .

# No separate build step for dev; each service runs `bun run dev` in its app dir.
# For production you could add turbo build and switch to node/bun run start.
