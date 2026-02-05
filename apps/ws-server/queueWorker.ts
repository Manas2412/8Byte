/**
 * Consumes portfolio refresh requests from Redis Stream in batches.
 * Processes with delay between batches to avoid Yahoo/Google API rate limits.
 */

import {
  getRedis,
  ensurePortfolioRefreshConsumerGroup,
  readPortfolioRefreshBatch,
  ackPortfolioRefresh,
  setPortfolioEnrichedCache,
} from "cached-db/client";
import { buildEnrichedPortfolio } from "./lib/portfolioEnrich.js";

const BATCH_SIZE = Number(process.env.PORTFOLIO_QUEUE_BATCH_SIZE ?? 3);
const BLOCK_MS = Number(process.env.PORTFOLIO_QUEUE_BLOCK_MS ?? 3000);
const DELAY_BETWEEN_BATCHES_MS = Number(
  process.env.PORTFOLIO_QUEUE_DELAY_MS ?? 5000
); // 5s between batches to avoid API overload
const CONSUMER_NAME = "ws-worker";

export function startPortfolioQueueWorker(): void {
  const client = getRedis();
  if (!client) {
    console.warn(
      "[ws-server] REDIS_URL not set; skipping portfolio queue worker."
    );
    return;
  }

  async function processBatch() {
    try {
      const messages = await readPortfolioRefreshBatch(CONSUMER_NAME, {
        batchSize: BATCH_SIZE,
        blockMs: BLOCK_MS,
      });

      if (messages.length === 0) {
        setImmediate(processBatch);
        return;
      }

      const prisma = (await import("db/client")).default;

      for (const { streamId, userId } of messages) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
              portfolio: { include: { stocks: true } },
            },
          });

          if (!user) {
            await ackPortfolioRefresh(streamId);
            continue;
          }

          const payload = await buildEnrichedPortfolio(user);
          if (payload) {
            await setPortfolioEnrichedCache(userId, payload);
          } else {
            const empty = {
              id: user.id,
              name: user.name,
              email: user.email,
              stocks: [],
              totalInvestment: 0,
              cachedAt: new Date().toISOString(),
            };
            await setPortfolioEnrichedCache(userId, empty);
          }
          await ackPortfolioRefresh(streamId);
        } catch (err) {
          console.error(`[ws-server] Queue worker failed for ${userId}:`, err);
          await ackPortfolioRefresh(streamId);
        }
      }

      if (DELAY_BETWEEN_BATCHES_MS > 0) {
        setTimeout(processBatch, DELAY_BETWEEN_BATCHES_MS);
      } else {
        setImmediate(processBatch);
      }
    } catch (err) {
      console.error("[ws-server] Queue worker error:", err);
      setTimeout(processBatch, 5000);
    }
  }

  (async () => {
    try {
      await ensurePortfolioRefreshConsumerGroup();
      console.log(
        `[ws-server] Portfolio queue worker: batch=${BATCH_SIZE}, delay=${DELAY_BETWEEN_BATCHES_MS}ms`
      );
      processBatch();
    } catch (err) {
      console.error("[ws-server] Failed to start queue worker:", err);
    }
  })();
}
