/**
 * Shared Redis cache for portfolio-enriched data.
 * Use in backend-server and ws-server via: import { ... } from "cached-db/client"
 *
 * FLOW:
 * 1. Request → backend-server → cached-db (getPortfolioEnrichedCache).
 *    - If cache HIT: return data to client.
 * 2. If cache MISS: backend-server → ws-server POST /refresh-portfolio → push userId to Redis stream (queue).
 * 3. Queue worker (ws-server) consumes stream in batches, fetches data (Yahoo/Google), writes to cached-db (setPortfolioEnrichedCache).
 * 4. Client gets data: backend polls cache after 202, or client polls GET /portfolio-cache / retries.
 * 5. Every 15s: ws-server job pushes all users with portfolios to the same stream; worker processes and overwrites cache with fresh data (cache is updated, not explicitly reset).
 *
 * Rate limiting & safety: We cache NSE (and optionally other) quote responses per symbol in Redis (1 request per symbol per minute).
 * Never scrape on every page load; all live data is fetched only in the queue worker with delays between batches.
 *
 * Set REDIS_URL in your app .env:
 *   REDIS_URL="redis://127.0.0.1:6379"
 * (Use 127.0.0.1 if redis://localhost gives getaddrinfo ENOTFOUND.)
 */

import Redis from "ioredis";

let redis: Redis | null = null;

const REDIS_URL = process.env.REDIS_URL;
const CACHE_TTL_SECONDS = Number(process.env.PORTFOLIO_CACHE_TTL ?? 60);

let lastRedisErrorLog = 0;
const REDIS_ERROR_LOG_INTERVAL_MS = 15_000;

export function getRedis(): Redis | null {
  if (!REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
    redis.on("error", (err) => {
      const now = Date.now();
      if (now - lastRedisErrorLog >= REDIS_ERROR_LOG_INTERVAL_MS) {
        lastRedisErrorLog = now;
        console.warn(
          "[cached-db] Redis:",
          err.message,
          "- Is Redis running? Use REDIS_URL=redis://127.0.0.1:6379 if localhost fails."
        );
      }
    });
  }
  return redis;
}

export async function setPortfolioEnrichedCache(
  userId: string,
  data: unknown
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  const key = `portfolio:enriched:${userId}`;
  await client.setex(key, CACHE_TTL_SECONDS, JSON.stringify(data));
}

export async function getPortfolioEnrichedCache(
  userId: string
): Promise<unknown | null> {
  const client = getRedis();
  if (!client) return null;
  const key = `portfolio:enriched:${userId}`;
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export { CACHE_TTL_SECONDS };

// ----- Per-symbol quote cache (rate limiting: 1 request per symbol per minute) -----

const QUOTE_CACHE_TTL_SECONDS = Number(process.env.QUOTE_CACHE_TTL ?? 60);

/**
 * Get cached quote data for a symbol. Used to respect rate limits:
 * 1 request per symbol per minute. Never scrape/fetch on every page load.
 */
export async function getQuoteCache(
  symbol: string,
  source: "yahoo" | "google" | "nse"
): Promise<unknown | null> {
  const client = getRedis();
  if (!client) return null;
  const key = `quote:${source}:${symbol}`;
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Set cached quote data for a symbol. TTL defaults to 60s (1 req per symbol per minute).
 */
export async function setQuoteCache(
  symbol: string,
  source: "yahoo" | "google" | "nse",
  data: unknown,
  ttlSeconds: number = QUOTE_CACHE_TTL_SECONDS
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  const key = `quote:${source}:${symbol}`;
  await client.setex(key, ttlSeconds, JSON.stringify(data));
}

export { QUOTE_CACHE_TTL_SECONDS };

// ----- Redis Stream queue (portfolio refresh – batch processing to avoid API overload) -----

export const PORTFOLIO_REFRESH_STREAM = "portfolio:refresh:stream";
export const PORTFOLIO_REFRESH_GROUP = "portfolio-refresh-group";

/** Push a userId to the refresh stream (returns message id or null). */
export async function pushPortfolioRefreshToStream(
  userId: string
): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  const id = await client.xadd(
    PORTFOLIO_REFRESH_STREAM,
    "*",
    "userId",
    userId
  );
  return id;
}

/** Ensure consumer group exists (call once before reading). */
export async function ensurePortfolioRefreshConsumerGroup(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    await client.xgroup(
      "CREATE",
      PORTFOLIO_REFRESH_STREAM,
      PORTFOLIO_REFRESH_GROUP,
      "0",
      "MKSTREAM"
    );
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err?.message?.includes("BUSYGROUP")) return true; // already exists
    throw e;
  }
  return true;
}

export type PortfolioRefreshMessage = { streamId: string; userId: string };

/** Read a batch of pending refresh requests (for worker). blockMs = 0 for non-blocking. */
export async function readPortfolioRefreshBatch(
  consumerName: string,
  options: { batchSize?: number; blockMs?: number } = {}
): Promise<PortfolioRefreshMessage[]> {
  const client = getRedis();
  if (!client) return [];
  const { batchSize = 5, blockMs = 2000 } = options;

  const result =
    blockMs > 0
      ? await client.xreadgroup(
          "GROUP",
          PORTFOLIO_REFRESH_GROUP,
          consumerName,
          "COUNT",
          batchSize,
          "BLOCK",
          blockMs,
          "STREAMS",
          PORTFOLIO_REFRESH_STREAM,
          ">"
        )
      : await client.xreadgroup(
          "GROUP",
          PORTFOLIO_REFRESH_GROUP,
          consumerName,
          "COUNT",
          batchSize,
          "STREAMS",
          PORTFOLIO_REFRESH_STREAM,
          ">"
        );

  if (!result || !Array.isArray(result) || result.length === 0) return [];

  const messages: PortfolioRefreshMessage[] = [];
  for (const [, entries] of result as [string, [string, string[]][]][]) {
    if (!Array.isArray(entries)) continue;
    for (const [streamId, fields] of entries) {
      let userId = "";
      for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === "userId") userId = String(fields[i + 1] ?? "");
      }
      if (streamId && userId) messages.push({ streamId, userId });
    }
  }
  return messages;
}

/** Acknowledge processed message(s). */
export async function ackPortfolioRefresh(
  ...streamIds: string[]
): Promise<void> {
  const client = getRedis();
  if (!client || streamIds.length === 0) return;
  await client.xack(
    PORTFOLIO_REFRESH_STREAM,
    PORTFOLIO_REFRESH_GROUP,
    ...streamIds
  );
}
