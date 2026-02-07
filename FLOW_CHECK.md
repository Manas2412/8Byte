# How to check: backend-server → ws-server → Redis queue (live data)

This doc explains how to verify the flow that fetches live data (NSE CMP, P/E, etc.) and caches it in Redis.

## Flow overview

1. **Frontend** calls `GET /api/v1/stocks/portfolio-enriched` (backend) with `Authorization: Bearer <token>`.
2. **Backend** checks Redis cache. If **cache HIT with live data** (at least one stock has CMP) → returns cached data. If **cache MISS** or **cache STALE** (cached data has no live CMP) → builds enriched data itself (NSE), writes to Redis, returns; then **queues a refresh** on ws-server (fire-and-forget).
3. **ws-server** `POST /refresh-portfolio` receives `{ userId }`, pushes `userId` to **Redis stream** (queue), returns `202` with `messageId`.
4. **ws-server queue worker** reads from the Redis stream in batches, for each `userId` loads user + portfolio from DB, calls **buildEnrichedPortfolio** (NSE API), writes result to **Redis cache**, then acks the message.
5. **15s refresh job** (ws-server) pushes all users with portfolios to the same stream every 15s so cache stays warm.

So: **backend → ws-server → Redis queue** = backend (or 15s job) triggers ws-server to push to the queue; the worker consumes the queue and writes live data to Redis.

### Data source order (per symbol)

1. **NSE** – Try for all data (CMP, P/E). If successful, use it and stop.
2. If NSE fails → **Yahoo Finance** – CMP only (v8 chart API).
3. **Google Finance** – P/E ratio and latest earnings (when NSE failed; one page fetch, parsed from HTML).

Order: **NSE → Yahoo (CMP) → Google (P/E + latest earnings)**.

---

## 1. Prerequisites

- **Redis** running (e.g. `redis-server` or Docker), and `REDIS_URL` set in both backend and ws-server (e.g. `REDIS_URL=redis://127.0.0.1:6379`).
- **Backend** running (e.g. `bun run dev` in `apps/backend-server`).
- **ws-server** running (e.g. `bun run dev` in `apps/ws-server`).
- **Database** and **DATABASE_URL** set for backend and ws-server.

---

## 2. Check backend → ws-server → queue

### Backend terminal

When the backend **does not** serve from cache (cache miss or stale), it builds and then calls ws-server:

- You should see one of:
  - `[backend] portfolio-enriched: cache MISS for <userId> - building enriched (rate-limited)` (no cache or empty)
  - `[backend] portfolio-enriched: cache STALE (no live CMP) for <userId> - rebuilding` (cache had no live CMP; then the next line is "cache MISS ...")
- Then either:
    - `[backend] Queued refresh on ws-server for <userId>...` → **flow is working** (ws-server returned 202), or
    - `[backend] ws-server /refresh-portfolio returned <status>` → ws-server responded but not 202, or
    - `[backend] ws-server /refresh-portfolio request failed: ...` → backend could not reach ws-server (check URL, CORS, or that ws-server is running).

If you only ever see **cache HIT**, the queue path is still used by the **15s job** (see step 4).

### ws-server terminal

When backend (or 15s job) triggers a refresh:

- You should see:
  - `[ws-server] Queued refresh for userId: <id>... messageId: <id>` → **userId was pushed to Redis stream**.

If you see:
- `[ws-server] Redis unavailable; cannot queue refresh for ...` → Redis not connected; set `REDIS_URL` and ensure Redis is running.

---

## 3. Check Redis queue worker (live data → cache)

### ws-server terminal

When the **queue worker** consumes messages and writes to cache:

- You should see (every few seconds when there is work):
  - `[ws-server] Queue processed batch: N user(s) <userId1>..., <userId2>...` → **worker read from stream and wrote enriched data to Redis**.

On ws-server startup you should see:

- `[ws-server] Portfolio queue worker: batch=3, delay=5000ms` → worker is running.

If you see:
- `[ws-server] REDIS_URL not set; skipping portfolio queue worker.` → worker not started; set `REDIS_URL`.
- `[ws-server] Queue worker failed for <userId>: ...` → NSE or DB error for that user; check NSE connectivity and DB.

---

## 4. Check 15s refresh job (keeps cache warm)

### ws-server terminal

Every 15 seconds the ws-server pushes all users with portfolios to the stream:

- On startup: `[ws-server] Portfolio refresh job: push to queue every 15s`.
- After ~15s you should see `[ws-server] Queued refresh for userId: ...` for each user (if any), then shortly after `[ws-server] Queue processed batch: ...`.

If you see:
- `[ws-server] REDIS_URL not set; skipping 15s portfolio refresh job.` → job not started.
- `[ws-server] Refresh job: database not reachable...` or `Refresh job error:` → fix DB connection.

---

## 5. Quick checklist

| Step | What to check | Where to look |
|------|----------------|---------------|
| Redis | Redis is running and reachable | `redis-cli ping` → `PONG` |
| Backend cache read | Backend can read/write Redis | Backend logs: "cache HIT" or "cache MISS" |
| Backend → ws-server | Backend can call ws-server | Backend: "Queued refresh on ws-server for ..." |
| ws-server queue push | ws-server pushes to Redis stream | ws-server: "Queued refresh for userId: ... messageId: ..." |
| Worker running | Worker is consuming | ws-server: "Portfolio queue worker: batch=..." at startup |
| Worker processing | Worker writes to cache | ws-server: "Queue processed batch: N user(s) ..." |
| 15s job | Job pushes users to stream | ws-server: "Portfolio refresh job: push to queue every 15s" |

---

## 6. Optional: inspect Redis

```bash
# Stream length (pending work)
redis-cli XLEN portfolio:refresh:stream

# Consumer group info
redis-cli XINFO GROUPS portfolio:refresh:stream

# Portfolio cache for a user (replace USER_ID with real id)
redis-cli GET "portfolio:enriched:USER_ID"
```

If the stream has messages but the worker never logs "Queue processed batch", check that the consumer group exists and the worker is running. If the cache key has no value, the worker has not yet written for that user.

---

## 7. Troubleshooting: "Backend never logs cache miss but no live data"

**Symptom:** Backend always logs "cache HIT" but the frontend shows no live CMP / P/E.

**Cause:** The cache was filled with data that has no live CMP (e.g. old payload, or NSE failed and fallback wasn’t written correctly). The backend was serving that cached payload every time.

**Fix (in code):** The backend now treats cache as **STALE** when no stock has a numeric CMP: it logs `cache STALE (no live CMP) - rebuilding` and then runs the same path as a cache miss (load user, call NSE, write new cache). So:

1. Restart the backend so the new logic is active.
2. Reload the app: the first request may still hit the old cache; the backend will see "no live CMP", treat it as stale, rebuild, and overwrite the cache.
3. You should see in the backend log: `[backend] portfolio-enriched: cache STALE (no live CMP) for ... - rebuilding` then `cache MISS ...` then either live data written or fallback.

**Optional (one-time):** Clear the portfolio cache for your user so the next request is a real miss:

```bash
# Replace USER_ID with your actual user id (e.g. from sign-in response or DB)
redis-cli DEL "portfolio:enriched:USER_ID"
```

Then reload the frontend; the backend will get a cache miss and rebuild.
