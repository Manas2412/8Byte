# Frontend and backend flow

This doc describes the **frontend** flow (auth, data, ws-frontend) and the **backend** flow (backend-server, ws-server, db, cache db, Redis queue).

## Auth and navigation

```
sign-up  →  sign-in  →  user
```

- **Sign-up**: User registers; then typically redirects to sign-in.
- **Sign-in**: User logs in; token stored; redirect to `/user`.
- **User**: Authenticated area (dashboard, stocks, profile) under `/user/*`.

## Data and updates

### backend-server

**All remaining data and all updates** go through the backend-server (REST API).

- **Profile**: `GET /api/v1/users/profile` — name, email, portfolio (stocks list), total investment.
- **Stocks CRUD**: `POST /api/v1/stocks` to add; other mutations via backend.
- **Profile updates**: e.g. `PATCH /api/v1/users/profile` (if implemented).

The web app calls the backend for:

- Initial load of profile and portfolio.
- Any mutation (add stock, update profile, etc.).

### ws-frontend

**Only used to poll dynamic data** from the backend every 15 seconds.

- **Dynamic fields**: CMP, Present value, Gain/Loss, P/E ratio.
- **Mechanism**: `usePortfolioWithUpdates` from the `ws-frontend` package calls the backend (e.g. `GET /api/v1/stocks/portfolio-enriched` or `portfolio-cache`) at a fixed interval (default 15 s) and updates only the live/dynamic fields in the UI.

So:

- **backend-server** = source of truth for all data and for all writes.
- **ws-frontend** = frontend layer that only runs the 15 s poll for CMP, present value, Gain/Loss, P/E ratio (data still comes from the backend; ws-frontend only triggers the poll and updates state).

## Summary

| Concern              | Where it lives        |
|----------------------|------------------------|
| Auth flow            | sign-up → sign-in → user |
| Load profile/portfolio | backend-server        |
| Add/update/delete    | backend-server        |
| Poll CMP, PV, G/L, P/E every 15 s | ws-frontend (calls backend) |

---

## Backend flow

These three flows describe how the backend and ws-server work with the database and cache.

### 1. Frontend request → backend-server → db

Requests from the frontend (initial load of profile/portfolio, any mutation) go to **backend-server** only. Backend-server talks to **db** (PostgreSQL via Prisma).

```
frontend (request)  →  backend-server  →  db
```

- **Profile**: `GET /api/v1/users/profile` — backend reads user + portfolio + stocks from db, returns to frontend.
- **Mutations**: e.g. `POST /api/v1/stocks`, `PATCH /api/v1/users/profile` — backend writes to db, returns to frontend.
- No cache and no ws-server in this path.

### 2. Enriched data (cache vs ws-server + Redis queue)

When the frontend (or ws-frontend poll) asks for **enriched** portfolio data (CMP, present value, Gain/Loss, P/E), the flow is:

```
frontend  →  backend-server  →  cache db (Redis)
                    │
                    ├─ cache HIT  →  return data to frontend
                    │
                    └─ cache MISS  →  backend  →  ws-server (POST /refresh-portfolio)
                                            →  ws-server  →  Redis queue (push userId)
                                            →  queue worker  →  fetch data (e.g. Yahoo)
                                                           →  return value & store in cache db
                                            →  frontend gets 202 or backend polls cache and returns
```

- **backend-server**: On `GET /api/v1/stocks/portfolio-enriched`, it first checks **cache db** (Redis, via cached-db). If **cache hit**, it returns the data.
- **Cache miss**: Backend calls **ws-server** `POST /refresh-portfolio` with `userId`. Ws-server pushes the userId to a **Redis stream (queue)**. A **queue worker** (in ws-server) consumes the stream, fetches updated data (e.g. Yahoo Finance), writes the result into the **cache db**, and the client either receives 202 (then polls `GET /api/v1/stocks/portfolio-cache`) or the backend polls the cache and returns when ready.

### 3. Every 15 seconds: ws-server → Redis queue → update cache db

A **scheduled job** inside **ws-server** runs every 15 seconds. It does not serve a frontend request; it pushes refresh work into the same Redis queue so the cache stays fresh.

```
every 15 s:  ws-server (scheduled job)  →  Redis queue (push all user ids with portfolios)
                      →  queue worker  →  fetch updated data  →  update cache db
```

- **ws-server** runs a 15 s interval job that pushes all user ids (that have a portfolio) into the **Redis queue**.
- The same **queue worker** consumes the queue: fetches fresh CMP / P/E / etc., then **overwrites** the **cache db** (Redis) with the new enriched payload. So the cache is continuously updated for use by flow 2.
