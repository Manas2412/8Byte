# cached-db

Shared Redis cache for portfolio-enriched data. Used by **backend-server** (read cache, proxy on miss) and **ws-server** (write cache, 15s refresh).

## Usage

In backend-server or ws-server:

```ts
import {
  getRedis,
  getPortfolioEnrichedCache,
  setPortfolioEnrichedCache,
  CACHE_TTL_SECONDS,
} from "cached-db/client";
```

### Quote cache (rate limiting)

Per-symbol quote cache for NSE. **Never fetch on every page load.**

- **Cache responses (Redis / in-memory)**: NSE quote fetches are cached per symbol.
- **Limit requests**: Effectively 1 request per symbol per minute (configurable via `QUOTE_CACHE_TTL`, default 60s).
- **Keys**: `quote:nse:SYMBOL`.

```ts
import { getQuoteCache, setQuoteCache } from "cached-db/client";

// Check cache before calling NSE
const cached = await getQuoteCache(symbol, "nse");
if (cached) return cached;
// ... fetch from NSE API (backend only) ...
await setQuoteCache(symbol, "nse", { cmp, previousClose, peRatio });
```

Used by `backend-server` and `ws-server` when building enriched portfolios (CMP, P/E, present value). Always call NSE from backend; refresh runs in the queue with delays.

## Env

Set `REDIS_URL` in the app that uses this package (e.g. `apps/backend-server/.env`, `apps/ws-server/.env`):

- `REDIS_URL="redis://localhost:6379"`
- Optional: `PORTFOLIO_CACHE_TTL=30` (seconds)
- Optional: `QUOTE_CACHE_TTL=60` (seconds; per-symbol quote cache TTL, rate limiting)
