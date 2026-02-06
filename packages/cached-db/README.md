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

## Env

Set `REDIS_URL` in the app that uses this package (e.g. `apps/backend-server/.env`, `apps/ws-server/.env`):

- `REDIS_URL="redis://localhost:6379"`
- Optional: `PORTFOLIO_CACHE_TTL=30` (seconds)
