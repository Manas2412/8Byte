import { Router } from "express";
import authMiddleware, { type AuthRequest } from "./middleware.js";
import { getPortfolioEnrichedCache } from "cached-db/client";

const WS_SERVER_URL = process.env.WS_SERVER_URL ?? "http://localhost:8081";
const WS_FETCH_TIMEOUT_MS = Number(process.env.WS_FETCH_TIMEOUT_MS ?? 15_000);

const stocksRouter = Router();

/**
 * Flow: check cached-db first (cache hit → return). On miss: POST ws-server → push to Redis queue;
 * worker fetches data and updates cache; we poll cache or return 202 for client to poll /portfolio-cache.
 */
stocksRouter.get("/portfolio-enriched", authMiddleware, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const cached = await getPortfolioEnrichedCache(userId);
    if (cached != null) {
      console.log("[backend] portfolio-enriched: cache HIT for", userId);
      res.json(cached);
      return;
    }

    console.log("[backend] portfolio-enriched: cache MISS for", userId, "- calling ws-server");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WS_FETCH_TIMEOUT_MS);

    let refreshRes: Response;
    try {
      refreshRes = await fetch(`${WS_SERVER_URL}/refresh-portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (refreshRes.status === 202) {
      const body = (await refreshRes.json()) as { queued: boolean; userId: string };
      const pollAttempts = 8;
      const pollIntervalMs = 1500;
      for (let i = 0; i < pollAttempts; i++) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        const cached = await getPortfolioEnrichedCache(userId);
        if (cached != null) {
          res.json(cached);
          return;
        }
      }
      res.status(202).json({
        message: "Queued for refresh. Poll GET /api/v1/stocks/portfolio-cache or retry shortly.",
        userId: body.userId,
      });
      return;
    }

    if (!refreshRes.ok) {
      const text = await refreshRes.text();
      console.error("ws-server /refresh-portfolio error:", refreshRes.status, text);
      res.status(502).json({
        message: "Portfolio refresh failed. Ensure ws-server is running and REDIS_URL is set.",
      });
      return;
    }

    const payload = (await refreshRes.json()) as unknown;
    res.json(payload);
  } catch (error: unknown) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    if (isTimeout) {
      console.error("portfolio-enriched: ws-server request timed out. Is ws-server running at", WS_SERVER_URL);
      res.status(504).json({
        message: "Portfolio refresh timed out. Ensure ws-server is running and reachable at WS_SERVER_URL.",
      });
      return;
    }
    console.error("Error in portfolio-enriched:", error);
    res.status(500).json({
      message: "Internal server error. Ensure ws-server is reachable at WS_SERVER_URL.",
    });
  }
});

/** Current stocks data from Redis cache only (no fetch). 404 if not cached. */
stocksRouter.get("/portfolio-cache", authMiddleware, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const cached = await getPortfolioEnrichedCache(userId);
    if (cached == null) {
      res.status(404).json({
        message: "No cached portfolio data. Use GET /api/v1/stocks/portfolio-enriched first or wait for the 15s refresh.",
      });
      return;
    }
    res.json(cached);
  } catch (error) {
    console.error("Error reading portfolio cache:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Hint when user hits the wrong path (e.g. profile-enriched instead of portfolio-enriched)
stocksRouter.get("/profile-enriched", (_req, res) => {
  res.status(404).json({
    error: "Not found. Use GET /api/v1/stocks/portfolio-enriched (not profile-enriched).",
    correctPath: "/api/v1/stocks/portfolio-enriched",
  });
});

stocksRouter.get("/:symbol", (req, res) => {
  const { symbol } = req.params;

  if (!symbol) {
    res.status(400).json({ error: "Symbol is required" });
    return;
  }

  res.json({
    symbol,
    price: 100 + symbol.length, // placeholder logic
  });
});

export default stocksRouter;
