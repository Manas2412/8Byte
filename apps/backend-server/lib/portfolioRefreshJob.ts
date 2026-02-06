/**
 * Background job: every REFRESH_INTERVAL_MS (default 15s), fetch fresh portfolio
 * data for all users with portfolios and write to Redis.
 */

import { getRedis, setPortfolioEnrichedCache } from "cached-db/client";
import { buildEnrichedPortfolio } from "./portfolioEnrich.js";

const REFRESH_INTERVAL_MS = Number(
  process.env.PORTFOLIO_REFRESH_INTERVAL_MS ?? 15_000
); // 15 seconds default

export function startPortfolioRefreshJob(): void {
  const client = getRedis();
  if (!client) {
    console.warn(
      "[portfolio-refresh] REDIS_URL not set; skipping 15s portfolio refresh job."
    );
    return;
  }

  async function refresh() {
    const db = await import("db/client").catch((e) => {
      console.error("[portfolio-refresh] Failed to load db client:", e);
      return null;
    });
    if (!db) return;

    const prisma = db.default;
    try {
      const users = await prisma.user.findMany({
        where: { portfolio: { isNot: null } },
        include: {
          portfolio: { include: { stocks: true } },
        },
      });

      for (const user of users) {
        try {
          const payload = await buildEnrichedPortfolio(user);
          if (payload) await setPortfolioEnrichedCache(user.id, payload);
        } catch (err) {
          console.error(
            `[portfolio-refresh] Failed for user ${user.id}:`,
            err
          );
        }
      }
    } catch (err) {
      console.error("[portfolio-refresh] Job error:", err);
    }
  }

  refresh(); // run once immediately
  setInterval(refresh, REFRESH_INTERVAL_MS);
  console.log(
    `[portfolio-refresh] Started: refreshing portfolio cache every ${REFRESH_INTERVAL_MS / 1000}s`
  );
}
