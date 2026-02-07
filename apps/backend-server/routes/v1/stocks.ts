import { Router } from "express";
import authMiddleware, { type AuthRequest } from "./middleware.js";
import { getPortfolioEnrichedCache } from "cached-db/client";

const WS_SERVER_URL = process.env.WS_SERVER_URL ?? "http://localhost:8081";
const WS_FETCH_TIMEOUT_MS = Number(process.env.WS_FETCH_TIMEOUT_MS ?? 15_000);

let prismaPromise: Promise<typeof import("db/client").default> | null = null;
function getPrisma() {
  if (!prismaPromise) prismaPromise = import("db/client").then((m) => m.default);
  return prismaPromise;
}

const STOCK_INDUSTRIES = [
  "Healthcare",
  "Finance",
  "Technology",
  "Energy",
  "Consumer",
  "Materials",
  "Utilities",
] as const;

const stocksRouter = Router();

/** Add a stock to the authenticated user's portfolio. */
stocksRouter.post("/", authMiddleware, async (req, res) => {
  const { userId } = req as AuthRequest;
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
  const industryRaw = typeof body.industry === "string" ? body.industry.trim() : "";
  const industry = STOCK_INDUSTRIES.includes(industryRaw as (typeof STOCK_INDUSTRIES)[number])
    ? (industryRaw as (typeof STOCK_INDUSTRIES)[number])
    : "Technology";
  const purchasePriceRaw = body.purchasePrice;
  const purchasePrice =
    typeof purchasePriceRaw === "number"
      ? purchasePriceRaw
      : Number(typeof purchasePriceRaw === "string" ? purchasePriceRaw.trim() : purchasePriceRaw);
  const quantityRaw = body.quantity;
  const quantity =
    typeof quantityRaw === "number"
      ? Math.floor(quantityRaw)
      : Math.floor(Number(typeof quantityRaw === "string" ? quantityRaw.trim() : quantityRaw));

  if (!name || !symbol) {
    res.status(400).json({ message: "Stock name and symbol are required" });
    return;
  }
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    res.status(400).json({ message: "Purchase price must be a positive number" });
    return;
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    res.status(400).json({ message: "Quantity must be a positive integer" });
    return;
  }

  const investment = Math.round(purchasePrice * quantity * 100) / 100;

  try {
    const prisma = await getPrisma();
    let portfolio = await prisma.portfolio.findUnique({ where: { userId } });
    if (!portfolio) {
      portfolio = await prisma.portfolio.create({ data: { userId } });
    }
    const stock = await prisma.stock.create({
      data: {
        name,
        symbol: symbol.toUpperCase(),
        exchange: "NSE",
        industry,
        purchasedPrice: purchasePrice,
        purchasedQuantity: quantity,
        investment,
        purchasedAt: new Date(),
        portfolioId: portfolio.id,
      } as Parameters<typeof prisma.stock.create>[0]["data"],
    });
    const created = stock as { id: string; name: string; symbol: string; industry?: string; purchasedPrice: unknown; purchasedQuantity: number; investment: unknown };
    res.status(201).json({
      id: created.id,
      name: created.name,
      symbol: created.symbol,
      industry: created.industry,
      purchasePrice: Number(created.purchasedPrice),
      quantity: created.purchasedQuantity,
      investment: Number(created.investment),
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const msg =
      err?.code === "P2002"
        ? "A stock with this symbol or name already exists."
        : err?.code === "P2003"
          ? "Invalid portfolio. Please try again."
          : typeof err?.message === "string"
            ? err.message
            : "Failed to add stock.";
    console.error("Error adding stock:", e);
    res.status(400).json({ message: msg });
  }
});

/** Delete one or more stocks by id or symbol (must belong to the authenticated user's portfolio). */
stocksRouter.delete("/", authMiddleware, async (req, res) => {
  const { userId } = req as AuthRequest;
  const body = req.body as Record<string, unknown>;
  const rawIds = body.stockIds;
  const rawSymbols = body.symbols;
  const stockIds = Array.isArray(rawIds)
    ? (rawIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const symbols = Array.isArray(rawSymbols)
    ? (rawSymbols as unknown[]).filter((x): x is string => typeof x === "string").map((s) => s.toUpperCase())
    : [];
  if (stockIds.length === 0 && symbols.length === 0) {
    res.status(400).json({ message: "stockIds or symbols array is required with at least one value" });
    return;
  }
  try {
    const prisma = await getPrisma();
    const portfolio = await prisma.portfolio.findUnique({ where: { userId } });
    if (!portfolio) {
      res.status(200).json({ deleted: 0, message: "No portfolio" });
      return;
    }
    const where = { portfolioId: portfolio.id } as { portfolioId: string; id?: { in: string[] }; symbol?: { in: string[] } };
    if (stockIds.length > 0) {
      where.id = { in: stockIds };
    } else {
      where.symbol = { in: symbols };
    }
    const result = await prisma.stock.deleteMany({ where });
    res.status(200).json({ deleted: result.count });
  } catch (e) {
    console.error("Error deleting stocks:", e);
    res.status(500).json({ message: "Failed to delete stocks" });
  }
});

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
