function toYahooSymbol(symbol: string, exchange: string): string {
  const s = symbol.trim();
  if (s.endsWith(".NS") || s.endsWith(".BO")) return s;
  if (exchange.toUpperCase() === "BSE") return `${s}.BO`;
  if (exchange.toUpperCase() === "NSE") return `${s}.NS`;
  return s;
}

function toGoogleFinanceSymbol(symbol: string, exchange: string): string {
  const s = symbol.trim();
  const ex = exchange.toUpperCase();
  // Google Finance quote URLs typically look like:
  // - https://www.google.com/finance/quote/TCS:NSE
  // - https://www.google.com/finance/quote/RELIANCE:BOM (BSE is often BOM)
  if (s.includes(":")) return s; // already in SYMBOL:EX form
  if (ex === "BSE") return `${s}:BOM`;
  if (ex === "NSE") return `${s}:NSE`;
  return `${s}:${ex}`;
}

/**
 * Yahoo Finance does not have an official public API.
 * We use the unofficial `yahoo-finance2` library as a pragmatic solution.
 */
async function fetchYahooCmp(yahooSymbol: string): Promise<number | null> {
  try {
    const yahooFinance = (await import("yahoo-finance2")).default;
    const quote = (await yahooFinance.quote(yahooSymbol)) as {
      regularMarketPrice?: number;
      regularMarketOpen?: number;
    };
    return quote.regularMarketPrice ?? quote.regularMarketOpen ?? null;
  } catch {
    return null;
  }
}

type GoogleFinanceMetrics = {
  peRatio: number | null;
  latestEarnings: string | null; // ISO date or a human string if only that is available
  sourceUrl: string;
};

/**
 * Google Finance also does not have an official public API.
 * Best-effort implementation via HTML fetching + scraping.
 *
 * NOTE: Scraping can break if Google changes markup; we keep this resilient and optional.
 */
async function fetchGoogleFinanceMetrics(
  googleSymbol: string
): Promise<GoogleFinanceMetrics> {
  const sourceUrl = `https://www.google.com/finance/quote/${encodeURIComponent(
    googleSymbol
  )}`;

  try {
    const res = await fetch(sourceUrl, {
      headers: {
        // A simple UA reduces the chance of getting a blocked/empty response.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      return { peRatio: null, latestEarnings: null, sourceUrl };
    }
    const html = await res.text();

    // --- P/E ratio ---
    // Try a few patterns; Google markup varies by region/experiment.
    const pePatterns: RegExp[] = [
      /P\/E ratio<\/div>\s*<div[^>]*>([^<]+)</i,
      /P\/E\s*ratio<\/div>\s*<div[^>]*>([^<]+)</i,
      /"P\/E ratio"[^]*?>([^<]{1,20})</i,
    ];
    let peRaw: string | null = null;
    for (const re of pePatterns) {
      const m = html.match(re);
      if (m?.[1]) {
        peRaw = m[1].trim();
        break;
      }
    }
    const peRatio =
      peRaw && peRaw !== "-" ? Number(peRaw.replace(/,/g, "")) : null;
    const pe = Number.isFinite(peRatio as number) ? (peRatio as number) : null;

    // --- Latest earnings ---
    // Best-effort: look for an earnings-related date in the page.
    // We accept ISO yyyy-mm-dd if present, otherwise a human date like "Feb 5, 2026".
    const isoDate = html.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null;
    const humanDate =
      html.match(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+20\d{2}\b/
      )?.[0] ?? null;

    // Only return a date if it appears close to an earnings keyword (reduce false positives).
    const earningsWindow = html
      .toLowerCase()
      .slice(0, Math.min(html.length, 250_000)); // cap scanning cost
    const hasEarningsKeyword =
      earningsWindow.includes("earnings") || earningsWindow.includes("eps");

    const latestEarnings =
      hasEarningsKeyword ? isoDate ?? humanDate ?? null : null;

    return { peRatio: pe, latestEarnings, sourceUrl };
  } catch {
    return { peRatio: null, latestEarnings: null, sourceUrl };
  }
}

export type StockRow = {
  symbol: string;
  name: string;
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

export type EnrichedPortfolioPayload = {
  id: string;
  name: string;
  email: string;
  stocks: unknown[];
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

  const enriched = await Promise.all(
    stocks.map(async (s) => {
      const investment = Number(s.investment);
      const qty = s.purchasedQuantity;
      const exchange = s.exchange ?? "NSE";
      const yahooSymbol = toYahooSymbol(s.symbol, exchange);
      const googleSymbol = toGoogleFinanceSymbol(s.symbol, exchange);

      let cmp: number | null = null;
      let peRatio: number | null = null;
      let latestEarnings: string | null = null;

      try {
        // Yahoo (unofficial): CMP / price
        cmp = await fetchYahooCmp(yahooSymbol);

        // Google Finance (scrape, unofficial): P/E + earnings
        const g = await fetchGoogleFinanceMetrics(googleSymbol);
        peRatio = g.peRatio;
        latestEarnings = g.latestEarnings;
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
        stockName: s.name,
        symbol: s.symbol,
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
        dataSource: {
          // Both are unofficial (no public official APIs).
          yahoo: { symbol: yahooSymbol, note: "unofficial (yahoo-finance2)" },
          google: {
            symbol: googleSymbol,
            note: "unofficial (HTML scrape)",
            url: `https://www.google.com/finance/quote/${encodeURIComponent(
              googleSymbol
            )}`,
          },
        },
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
