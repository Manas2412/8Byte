# 8Byte 📊

A portfolio and stock tracking platform built with Next.js and a Turbo monorepo, with live quotes from NSE, Yahoo Finance, and Google Finance fallback.

**8Byte**

---

## 🚀 Features

- **📈 Portfolio dashboard** – View holdings, CMP, present value, gain/loss, and P/E ratio.
- **📉 Stock management** – Add and manage stocks with purchase price, quantity, and industry filters.
- **🔐 Secure authentication** – Sign up, sign in, and JWT-protected API routes.
- **👤 User profile** – Update name, phone, country code, and bio.
- **⚡ Live data flow** – NSE → Yahoo (CMP) → Google (P/E, earnings) with Redis caching and a queue worker for rate-limited refreshes.
- **🎨 Modern UI** – Dark theme, responsive layout, and Tailwind-based components.
- **🐳 Docker-ready** – Full stack (Postgres, Redis, backend, ws-server, web) via Docker Compose.

---

## 🛠️ Tech Stack

| Layer        | Technology                          |
|-------------|--------------------------------------|
| **Framework** | Next.js 16 (App Router)             |
| **Backend**   | Express (Node/Bun)                 |
| **Real-time**| WebSocket server (Bun) + Redis queue|
| **Language** | TypeScript                          |
| **Monorepo** | Turborepo, Bun workspaces          |
| **Database** | PostgreSQL 16 + Prisma             |
| **Cache**    | Redis (portfolio + quote cache)    |
| **Auth**     | JWT (custom)                        |

---


## 🏁 Getting Started

### Prerequisites

- **Bun** 1.3.x ([bun.sh](https://bun.sh))
- **PostgreSQL** 16 (for local dev)
- **Redis** (for local dev)
- **Docker & Docker Compose** (optional, for containerized run)

### Environment Variables

Create `.env` in the app directories (or use the examples below).

**Backend** (`apps/backend-server/.env`):

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/mydb"

# Redis & ws-server
REDIS_URL="redis://127.0.0.1:6379"
WS_SERVER_URL="http://localhost:8081"

# Auth & server
JWT_SECRET="your-secret"
PORT=3001
```

**ws-server** (`apps/ws-server/.env`): set `DATABASE_URL`, `REDIS_URL`, `WS_HTTP_PORT`, `WS_PORT`.

**Web** (`apps/web/.env.local`): optional; default is `NEXT_PUBLIC_API_URL=http://localhost:3001`.

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Manas2412/8Byte.git
   cd 8Byte
   ```

2. **Install dependencies:**

   ```bash
   bun install
   ```

3. **Generate Prisma client and run migrations:**

   ```bash
   cd packages/db && bunx prisma generate && bunx prisma migrate deploy && cd ../..
   ```

4. **Run the development server:**

   ```bash
   bun run dev
   ```

   Or run each app in a separate terminal (see **Usage** below).

5. **Access the application:** Open [http://localhost:3000](http://localhost:3000) in your browser.


---

## 💻 Usage

### Local development (separate terminals)

1. Start **Postgres** and **Redis** locally (e.g. `brew services start postgresql redis`).
2. **Backend:** `cd apps/backend-server && bun run dev` → [http://localhost:3001](http://localhost:3001)
3. **ws-server:** `cd apps/ws-server && bun run dev` → HTTP 8081, WS 8080
4. **Web:** `cd apps/web && bun run dev` → [http://localhost:3000](http://localhost:3000)

### Commands (from repo root)

| Command            | Description                |
|--------------------|----------------------------|
| `bun run dev`      | Start all apps (Turbo)     |
| `bun run build`    | Build all apps             |
| `bun run lint`     | Lint all packages          |
| `bun run check-types` | Type-check all packages |
| `bun run format`   | Format with Prettier       |

---

## 🐳 Docker Usage (Production)

For a production-style run with Docker Compose:

```bash
docker compose up --build -d
```

**First time only – run database migrations:**

```bash
docker compose run --rm backend sh -c "cd /app/packages/db && bunx prisma migrate deploy"
```

This runs:

- **Web** on port **3000**
- **Backend API** on port **3001**
- **Postgres** on host port **5433** (container 5432)
- **Redis** on host port **6380** (container 6379)

---

## 🚀 Automated Deployment (CI/CD)

The project uses a GitHub Actions workflow (`.github/workflows/cd_dev.yml`) for CI on push to `dev` or `main`.

The workflow:

- Runs **lint**, **type-check**, and **build** (no Docker build or push to ghcr.io).

Docker images are built and run on your own server (e.g. EC2). After pushing code:

```bash
git pull
docker compose build
docker compose up -d
```

---

## 📁 Project Structure

| Path | Description |
|------|-------------|
| `apps/backend-server/` | Express API (auth, profile, stocks, portfolio-enriched) |
| `apps/ws-server/` | WebSocket + HTTP; portfolio refresh queue and Redis worker |
| `apps/web/` | Next.js frontend (App Router) |
| `packages/db/` | Prisma schema, migrations, generated client |
| `packages/cached-db/` | Redis cache (portfolio, quote cache) |
| `packages/backend-common/` | Shared config (e.g. JWT) |
| `packages/common/` | Shared TypeScript types |
| `packages/ws-frontend/` | Frontend hook for portfolio polling |

---

## 📖 Documentation

- **TROUBLESHOOTING.md** – Common errors (Docker/ghcr.io, env, Redis/Postgres)
- **docker-compose.yml** – Service definitions, ports, and env
- **.github/workflows/cd_dev.yml** – CI workflow (lint, typecheck, build)

---

## 📝 License

This project is licensed under the MIT License.
