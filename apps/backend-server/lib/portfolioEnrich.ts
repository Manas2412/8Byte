/**
 * Shared logic to build enriched portfolio (profile stocks + Yahoo CMP, P/E, earnings, present value, gain/loss).
 * Used by GET /portfolio-enriched and by the 15s Redis refresh job.
 */

function toYahooSymbol(symbol: string, exchange: string): string {
  const s = symbol.trim();
  if (s.endsWith(".NS") || s.endsWith(".BO")) return s;
  if (exchange.toUpperCase() === "BSE") return `${s}.BO`;
  if (exchange.toUpperCase() === "NSE") return `${s}.NS`;
  return s;
}

export type StockRow = {
  id: string;
  symbol: string;
  name: string;
  industry?: string;
  purchasedPrice: { toString(): string } | number;
  purchasedQuantity: number;
  investment: { toString(): string } | number;
  exchange?: string;
};

export type UserWithPortfolio = {
  id: string;
  name: string;
  email: string;
  portfolio: { stocks: StockRow[] } | null;
};

export type EnrichedStock = {
  id: string;
  stockName: string;
  symbol: string;
  industry?: string;
  exchange: string;
  purchasePrice: number;
  quantity: number;
  investment: number;
  cmp?: number;
  presentValue: number;
  gainLoss: number;
  peRatio?: number;
  latestEarnings?: string;
  portfolioPercent: number;
};

export type EnrichedPortfolioPayload = {
  id: string;
  name: string;
  email: string;
  stocks: EnrichedStock[];
  totalInvestment: number;
  cachedAt: string;
};

export async function buildEnrichedPortfolio(
  user: UserWithPortfolio
): Promise<EnrichedPortfolioPayload | null> {
  const stocks = user.portfolio?.stocks ?? [];
  if (stocks.length === 0) return null;

  const totalInvestment = stocks.reduce(
    (sum, s) => sum + Number(s.investment),
    0
  );

  const yahooFinance = (await import("yahoo-finance2")).default;

  const enriched = await Promise.all(
    stocks.map(async (s) => {
      const investment = Number(s.investment);
      const qty = s.purchasedQuantity;
      const exchange = s.exchange ?? "NSE";
      const yahooSymbol = toYahooSymbol(s.symbol, exchange);

      let cmp: number | null = null;
      let peRatio: number | null = null;
      let latestEarnings: string | null = null;

      try {
        const quote = (await yahooFinance.quote(yahooSymbol)) as {
          regularMarketPrice?: number;
          regularMarketOpen?: number;
          trailingPE?: number;
          forwardPE?: number;
          earningsTimestamp?: number;
          earningsTimestampStart?: number;
        };
        cmp = quote.regularMarketPrice ?? quote.regularMarketOpen ?? null;
        peRatio = quote.trailingPE ?? quote.forwardPE ?? null;
        const ts = quote.earningsTimestamp ?? quote.earningsTimestampStart;
        latestEarnings =
          ts != null
            ? new Date(ts * 1000).toISOString().slice(0, 10)
            : null;
      } catch {
        // leave cmp/pe/earnings null on fetch error
      }

      const cmpNum = cmp ?? Number(s.purchasedPrice);
      const presentValue = Math.round(cmpNum * qty * 100) / 100;
      const gainLoss = Math.round((presentValue - investment) * 100) / 100;
      const portfolioPercent =
        totalInvestment > 0
          ? Math.round((investment / totalInvestment) * 10000) / 100
          : 0;

      return {
        id: (s as { id: string }).id,
        stockName: s.name,
        symbol: s.symbol,
        industry: (s as { industry?: string }).industry,
        exchange,
        purchasePrice: Number(s.purchasedPrice),
        quantity: qty,
        investment,
        cmp: cmp ?? undefined,
        presentValue,
        gainLoss,
        peRatio: peRatio ?? undefined,
        latestEarnings: latestEarnings ?? undefined,
        portfolioPercent,
      };
    })
  );

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    stocks: enriched,
    totalInvestment,
    cachedAt: new Date().toISOString(),
  };
}
