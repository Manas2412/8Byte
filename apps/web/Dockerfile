# Build from repo root: docker build -f apps/web/Dockerfile .
FROM oven/bun:1
WORKDIR /app

# Workspace manifests for install
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

COPY . .
RUN rm -f .env .env.local .env.development .env.production 2>/dev/null; true

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["bun", "run", "dev"]
