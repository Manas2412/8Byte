import { getRedis, pushPortfolioRefreshToStream } from "cached-db/client";

const REFRESH_INTERVAL_MS = Number(
  process.env.PORTFOLIO_REFRESH_INTERVAL_MS ?? 15_000
);

/**
 * Every 15s: push all users with portfolios to the Redis stream.
 * Queue worker consumes batch-wise, fetches fresh data, and overwrites cached-db (no explicit cache reset).
 */
export function startPortfolioRefreshJob(): void {
  const client = getRedis();
  if (!client) {
    console.warn(
      "[ws-server] REDIS_URL not set; skipping 15s portfolio refresh job."
    );
    return;
  }

  async function refresh() {
    const db = await import("db/client").catch((e) => {
      console.error("[ws-server] Failed to load db client:", e);
      return null;
    });
    if (!db) return;

    const prisma = db.default;
    try {
      const users = await prisma.user.findMany({
        where: { portfolio: { isNot: null } },
        select: { id: true },
      });

      for (const user of users) {
        await pushPortfolioRefreshToStream(user.id);
      }
    } catch (err) {
      console.error("[ws-server] Refresh job error:", err);
    }
  }

  refresh();
  setInterval(refresh, REFRESH_INTERVAL_MS);
  console.log(
    `[ws-server] Portfolio refresh job: push to queue every ${REFRESH_INTERVAL_MS / 1000}s`
  );
}
