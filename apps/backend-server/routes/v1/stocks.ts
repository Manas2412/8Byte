import { Router } from "express";
import authMiddleware, { type AuthRequest } from "./middleware.js";
import { getPortfolioEnrichedCache, setPortfolioEnrichedCache } from "cached-db/client";
import { buildEnrichedPortfolio } from "../../lib/portfolioEnrich.js";

const WS_SERVER_URL = process.env.WS_SERVER_URL ?? "http://localhost:8081";

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

const RATE_LIMIT_HEADER =
  "Cache responses (Redis / in-memory); limit requests (e.g. 1 request per symbol per minute); never scrape on every page load.";


stocksRouter.get("/portfolio-enriched", authMiddleware, async (req, res) => {
  const { userId } = req as AuthRequest;
  console.log("[backend] GET /portfolio-enriched for userId:", userId?.slice(0, 8) + "...");
  res.setHeader("X-RateLimit-Info", RATE_LIMIT_HEADER);
  try {
    let cached: unknown = null;
    try {
      cached = await getPortfolioEnrichedCache(userId);
    } catch (e) {
      console.warn("[backend] portfolio-enriched: cache read failed (treating as miss):", e);
    }
    if (cached != null && typeof cached === "object" && Array.isArray((cached as { stocks?: unknown }).stocks)) {
      const body = cached as { id: string; name: string; email: string; stocks: unknown[]; totalInvestment: number; cachedAt: string };
      const hasLiveData = body.stocks.some((s: unknown) => {
        const row = s as Record<string, unknown>;
        const cmp = row.cmp != null ? Number(row.cmp) : null;
        const pp = row.purchasePrice != null ? Number(row.purchasePrice) : null;
        if (cmp == null || cmp <= 0) return false;
        if (row.peRatio != null && Number(row.peRatio) > 0) return true;
        if (pp != null && Math.abs(cmp - pp) > 0.01) return true;
        return false;
      });
      if (hasLiveData) {
        console.log("[backend] portfolio-enriched: cache HIT (with live data) for", userId);
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        const normalizedStocks = body.stocks.map((s: unknown) => {
          const row = s as Record<string, unknown>;
          return {
            id: row.id,
            stockName: row.stockName,
            symbol: row.symbol,
            industry: row.industry,
            exchange: row.exchange ?? "NSE",
            purchasePrice: row.purchasePrice != null ? Number(row.purchasePrice) : 0,
            quantity: row.quantity,
            investment: row.investment != null ? Number(row.investment) : 0,
            cmp: row.cmp != null ? Number(row.cmp) : undefined,
            presentValue: row.presentValue != null ? Number(row.presentValue) : (row.investment != null ? Number(row.investment) : 0),
            gainLoss: row.gainLoss != null ? Number(row.gainLoss) : 0,
            peRatio: row.peRatio != null ? Number(row.peRatio) : undefined,
            latestEarnings: row.latestEarnings != null ? String(row.latestEarnings) : undefined,
            portfolioPercent: row.portfolioPercent != null ? Number(row.portfolioPercent) : 0,
          };
        });
        res.json({ ...body, stocks: normalizedStocks });
        return;
      }
      console.log("[backend] portfolio-enriched: cache STALE (no live CMP) for", userId, "- rebuilding");
    }

    console.log("[backend] portfolio-enriched: cache MISS for", userId, "- building enriched (rate-limited)");
    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { portfolio: { include: { stocks: true } } },
    });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    if (!user.portfolio?.stocks?.length) {
      const empty = {
        id: user.id,
        name: user.name,
        email: user.email,
        stocks: [],
        totalInvestment: 0,
        cachedAt: new Date().toISOString(),
      };
      try {
        await setPortfolioEnrichedCache(userId, empty);
      } catch (_) {}
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.json(empty);
      return;
    }

    let payload: { id: string; name: string; email: string; stocks: unknown[]; totalInvestment: number; cachedAt: string } | null = null;
    try {
      payload = await buildEnrichedPortfolio(user as Parameters<typeof buildEnrichedPortfolio>[0]);
    } catch (buildErr) {
      console.error("[backend] buildEnrichedPortfolio failed, returning fallback with derived values:", buildErr);
    }
    if (payload?.stocks?.length) {
      try {
        await setPortfolioEnrichedCache(userId, payload);
      } catch (_) {}
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.json(payload);
    } else {
      // Fallback: use DB-only data so frontend still shows presentValue/gainLoss (using purchase price as CMP)
      const totalInvestment = user.portfolio!.stocks.reduce((sum, s) => sum + Number(s.investment), 0);
      const stocks = user.portfolio!.stocks.map((s) => {
        const inv = Number(s.investment);
        const qty = s.purchasedQuantity;
        const price = Number(s.purchasedPrice);
        const pv = Math.round(price * qty * 100) / 100;
        const gl = Math.round((pv - inv) * 100) / 100;
        const portfolioPercent = totalInvestment > 0 ? Math.round((inv / totalInvestment) * 10000) / 100 : 0;
        return {
          id: (s as { id: string }).id,
          stockName: s.name,
          symbol: s.symbol,
          industry: (s as { industry?: string }).industry,
          exchange: (s as { exchange?: string }).exchange ?? "NSE",
          purchasePrice: price,
          quantity: qty,
          investment: inv,
          cmp: price,
          presentValue: pv,
          gainLoss: gl,
          portfolioPercent,
        };
      });
      const fallback = {
        id: user.id,
        name: user.name,
        email: user.email,
        stocks,
        totalInvestment,
        cachedAt: new Date().toISOString(),
      };
      try {
        await setPortfolioEnrichedCache(userId, fallback);
      } catch (_) {}
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.json(fallback);
    }


    fetch(`${WS_SERVER_URL}/refresh-portfolio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
      .then((r) => {
        if (r.status === 202) console.log("[backend] Queued refresh on ws-server for", userId.slice(0, 8) + "...");
        else console.warn("[backend] ws-server /refresh-portfolio returned", r.status);
      })
      .catch((e) => console.warn("[backend] ws-server /refresh-portfolio request failed:", (e as Error).message));
  } catch (error: unknown) {
    console.error("Error in portfolio-enriched:", error);
    res.status(500).json({
      message: "Internal server error. Check REDIS_URL and database connection.",
    });
  }
});

stocksRouter.get("/portfolio-cache", authMiddleware, async (req, res) => {
  const { userId } = req as AuthRequest;
  res.setHeader("X-RateLimit-Info", RATE_LIMIT_HEADER);
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
