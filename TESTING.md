# Testing Backend and WS-Server

This guide covers how to run and fully test **backend-server** (REST API) and **ws-server** (HTTP API + Redis queue + WebSocket). You can test everything from **Postman** using Bearer token auth.

---

## Is seed necessary?

**No.** You can test all endpoints without running the seed.

| What you want to test | Seed required? |
|------------------------|----------------|
| Health, sign-up, sign-in, profile | **No** – sign up any user and use the returned token. |
| Portfolio-enriched / portfolio-cache with **non-empty** data (stocks, CMP, P/E) | **Yes** – the user must have a portfolio with stocks. Run the seed to get `test@example.com` with one stock (TCS). |
| Portfolio-enriched / portfolio-cache with **empty** portfolio | **No** – sign up, sign in, call the endpoints; you’ll get 200 with empty or minimal data. |

**Summary:** Use seed only when you want to test the full portfolio flow (cache, queue, Yahoo/Google data). For auth and basic API checks, sign-up is enough.

---

## Prerequisites

- **Bun** (recommended) or Node 18+
- **PostgreSQL** (for `db` package)
- **Redis** (for cache and queue)
- Env files set (see below)

---

## 1. Environment setup

From repo root:

```bash
cd 8Byte
bun install
```

Copy env examples:

- `apps/backend-server/.env` from `apps/backend-server/.env.example`  
  Set: `DATABASE_URL`, `REDIS_URL`, `WS_SERVER_URL` (e.g. `http://localhost:8081`). Optional: `JWT_SECRET`.
- `apps/ws-server/.env` from `apps/ws-server/.env.example`  
  Set: `DATABASE_URL`, `REDIS_URL`. Optional: `WS_HTTP_PORT`, queue vars.

---

## 2. Database and optional seed

```bash
cd packages/db
bunx prisma migrate deploy
cd ../..
```

**Optional – only if you want portfolio data in responses:**

```bash
cd apps/backend-server
bun run seed
```

Creates `test@example.com` / `Test@1234` with one portfolio and one stock (TCS, NSE).

---

## 3. Start Redis and servers

- Start **Redis** (e.g. `redis-server` or `docker run -d -p 6379:6379 redis:7-alpine`).

**Terminal 1 – WS-server:**

```bash
cd apps/ws-server
bun run dev
```

**Terminal 2 – Backend:**

```bash
cd apps/backend-server
bun run dev
```

- Backend: `http://localhost:4001`
- WS-server HTTP: `http://localhost:8082` (or `8081` if you use default; set `WS_HTTP_PORT` in ws-server `.env`)
- WS-server WebSocket: `ws://localhost:8083` (or set `WS_PORT` in ws-server `.env`)

In **backend** `.env`, set `WS_SERVER_URL=http://localhost:8082` so the backend can call the ws-server for portfolio refresh.

---

## 4. Backend test flow (Postman)

Test the backend in this order: **Sign-up → Sign-in → Profile → Stocks → Enriched profile**.

### 4.1 Postman environment

Create an **Environment** (e.g. “8Byte Local”) with:

| Variable   | Value                     |
|-----------|----------------------------|
| `base_url` | `http://localhost:4001`   |
| `ws_url`   | `http://localhost:8082`   |
| `token`    | *(leave empty; set after step 2)* |

After **Sign-in**, copy the response `token` into the `token` variable. For all later steps, use **Authorization → Bearer Token** → `{{token}}`.

---

### 4.2 Step-by-step flow

| Step | What to do | Request |
|------|------------|--------|
| **1. Sign-up** | Create a user | **POST** `{{base_url}}/api/v1/users/sign-up` |
| **2. Sign-in** | Get JWT and save as `{{token}}` | **POST** `{{base_url}}/api/v1/users/sign-in` |
| **3. Profile** | Get user and portfolio summary | **GET** `{{base_url}}/api/v1/users/profile` (Bearer `{{token}}`) |
| **4. Stocks** | Get basic stocks list | **GET** `{{base_url}}/api/v1/stocks` (Bearer optional; route may not require auth) |
| **5. Enriched profile** | Get portfolio with CMP, P/E, earnings (cache or queue) | **GET** `{{base_url}}/api/v1/stocks/portfolio-enriched` (Bearer `{{token}}`) |

**Optional after step 5:**  
- **GET** `{{base_url}}/api/v1/stocks/portfolio-cache` – cached enriched data only (404 if not cached).  
- **POST** `{{ws_url}}/refresh-portfolio` with body `{"userId":"<id from profile>"}` – queue a refresh on the ws-server.

---

### 4.3 Request details

**1. Sign-up** – **POST** `{{base_url}}/api/v1/users/sign-up`  
Body (raw JSON):

```json
{
  "email": "test@example.com",
  "password": "Test@1234",
  "name": "Test User"
}
```

Password rules: 8–20 chars, at least one uppercase, one lowercase, one number, one of `!@#$%^&*`.

**2. Sign-in** – **POST** `{{base_url}}/api/v1/users/sign-in`  
Body (raw JSON):

```json
{
  "email": "test@example.com",
  "password": "Test@1234"
}
```

Response includes **`token`** – copy it into your environment variable `token`. Use the same email/password if you ran the seed.

**3. Profile** – **GET** `{{base_url}}/api/v1/users/profile`  
- **Authorization:** Bearer Token `{{token}}`  
- Returns user `id`, name, email, stocks summary, totalInvestment.

**4. Stocks** – **GET** `{{base_url}}/api/v1/stocks`  
- Returns a simple stocks list (e.g. AAPL, GOOGL). Use when testing the stocks route.

**5. Enriched profile** – **GET** `{{base_url}}/api/v1/stocks/portfolio-enriched`  
- **Use `portfolio-enriched`** (not `profile-enriched`). Wrong path returns a placeholder `{ symbol, price }`.
- **Authorization:** Bearer Token `{{token}}`  
- **Flow:** Backend checks **cache first** (cached-db/Redis). On **cache miss** it calls ws-server (`POST /refresh-portfolio`), then polls cache or returns 202.
- Returns portfolio with CMP, P/E, latest earnings, present value, gain/loss. If not cached, backend queues refresh and may return 200 (after polling) or 202 (poll `/portfolio-cache` or retry).

**If step 5 doesn’t work:**

| What you see | What to check |
|--------------|----------------|
| **502** or “Portfolio refresh failed” | Backend can’t reach ws-server. In **backend** `.env` set `WS_SERVER_URL` to where ws-server runs (e.g. `http://localhost:8082` if ws-server uses port 8082). Start ws-server: `cd apps/ws-server && bun run dev`. |
| **202** “Queued for refresh” | Normal on first request. Wait 10–15 s, then call **GET** `{{base_url}}/api/v1/stocks/portfolio-enriched` again, or **GET** `{{base_url}}/api/v1/stocks/portfolio-cache`. Ensure **Redis** is running and **ws-server** is running (queue worker fills the cache). |
| **200 but empty `stocks: []`** | User has no portfolio. Run seed: `cd apps/backend-server && bun run seed`, then sign in with `test@example.com` / `Test@1234` and try again. |
| **401** | Token missing or wrong. Redo Sign-in (step 2) and set `{{token}}` again; use Bearer `{{token}}` on the request. |

Before testing step 5, ensure: **Redis** is running, **ws-server** is running (`bun run dev` in `apps/ws-server`), and **backend** `.env` has `WS_SERVER_URL=http://localhost:8082` (or the port your ws-server uses).

**Who calls ws-server when:**
- **On cache miss:** The **backend** calls ws-server (`POST /refresh-portfolio`) when a client requests portfolio-enriched and the cache is empty. You’ll see `[backend] portfolio-enriched: cache MISS - calling ws-server` in the backend log.
- **Every 15 seconds:** The **ws-server** (not the backend) runs a job that pushes all user IDs to the Redis queue; its worker then updates the cache. So the 15s refresh is entirely inside ws-server. The backend does not call ws-server on a timer.
- If you always see cache HIT and want to test the miss path: wait for cache TTL to expire (~60s) or flush Redis, then call portfolio-enriched again.

---

### 4.4 Backend endpoints reference

| Method | URL | Auth | Notes |
|--------|-----|------|--------|
| GET | `{{base_url}}/health` | None | `{"status":"ok"}` |
| POST | `{{base_url}}/api/v1/users/sign-up` | None | Create user |
| POST | `{{base_url}}/api/v1/users/sign-in` | None | Returns `token` |
| GET | `{{base_url}}/api/v1/users/profile` | Bearer `{{token}}` | Profile + portfolio summary |
| GET | `{{base_url}}/api/v1/stocks` | None | Basic stocks list |
| GET | `{{base_url}}/api/v1/stocks/portfolio-enriched` | Bearer `{{token}}` | Enriched portfolio (cache/queue) |
| GET | `{{base_url}}/api/v1/stocks/portfolio-cache` | Bearer `{{token}}` | Cached enriched only; 404 if not cached |
| POST | `{{ws_url}}/refresh-portfolio` | None | Body: `{"userId":"<id>"}` – queue refresh |

---

## 5. curl (optional) – same flow

Backend base: `http://localhost:4001`. Use the same order: sign-up → sign-in → profile → stocks → portfolio-enriched.

```bash
# 1. Sign-up
curl -s -X POST http://localhost:4001/api/v1/users/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@1234","name":"Test User"}'

# 2. Sign-in (copy token from response)
curl -s -X POST http://localhost:4001/api/v1/users/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@1234"}'

# 3. Profile (replace YOUR_TOKEN)
curl -s -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4001/api/v1/users/profile

# 4. Stocks
curl -s http://localhost:4001/api/v1/stocks

# 5. Enriched profile
curl -s -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4001/api/v1/stocks/portfolio-enriched
```

---

## 6. WebSocket (ws-server)

WebSocket URL: **ws://localhost:8083** (or whatever `WS_PORT` is in ws-server `.env`).  
Query param: `token=<JWT>` (same token from sign-in).

In Postman: New request → **WebSocket** → URL `ws://localhost:8083?token={{token}}`.

---

## Summary

| Step | Action |
|------|--------|
| Install | `bun install` (repo root) |
| Env | Copy `.env.example` → `.env` for backend and ws-server; set `WS_SERVER_URL=http://localhost:8082` in backend |
| DB | `cd packages/db && bunx prisma migrate deploy` |
| Seed | **Optional** – for non-empty portfolio: `cd apps/backend-server && bun run seed` |
| Redis | `redis://127.0.0.1:6379` (local Redis or Docker on 6379) |
| Servers | WS: `cd apps/ws-server && bun run dev`; Backend: `cd apps/backend-server && bun run dev` |
| **Backend test flow** | **Sign-up → Sign-in → Profile → Stocks → Enriched profile** (see §4) |

Seed is **not** required to test auth or endpoints; it is only needed to see real portfolio and enriched stock data (CMP, P/E, etc.) in responses.

---

## Troubleshooting

| Symptom | Cause | Fix |
|--------|--------|-----|
| `getaddrinfo ENOTFOUND` / `Reached the max retries per request limit` | Redis not running or host in `REDIS_URL` not resolving | Start Redis (`redis-server` or Docker on 6379). In `.env` set `REDIS_URL=redis://127.0.0.1:6379` (use `127.0.0.1` if `localhost` gives ENOTFOUND). |
| `Can't reach database server` / `DatabaseNotReachable` / P1001 in refresh job or queue worker | PostgreSQL not running or wrong `DATABASE_URL` | Start PostgreSQL. In ws-server and backend `.env` set `DATABASE_URL` (e.g. `postgresql://user:pass@localhost:5432/mydb`). |
| `[ws-server] Failed to start queue worker` | Usually Redis unreachable | Same as first row – ensure Redis is up and `REDIS_URL` is correct. |
