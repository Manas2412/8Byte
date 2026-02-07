/**
 * Shared logic to build enriched portfolio (profile stocks + NSE CMP, P/E, present value, gain/loss).
 * Used by GET /portfolio-enriched. Always call from backend; never from frontend.
 *
 * NSE: unofficial API. Rate limited: 1 req per symbol per minute via Redis.
 * Cache responses (Redis / in-memory); never fetch on every page load.
 */

/** NSE expects plain symbol (e.g. RELIANCE, TCS). Strip .NS/.BO and uppercase. */
function toNseSymbol(symbol: string, _exchange: string): string {
  const s = symbol.trim().toUpperCase();
  if (s.endsWith(".NS") || s.endsWith(".BO")) return s.slice(0, -3);
  return s;
}

type QuoteResult = {
  cmp: number | null;
  previousClose: number | null;
  peRatio: number | null;
  latestEarnings: string | null;
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en,gu;q=0.9,hi;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.nseindia.com/",
};

/**
 * Flow: NSE (all data) → on failure Yahoo (CMP only) → Google (P/E + latest earnings).
 */

/** Yahoo Finance v8 chart: CMP only. Use when NSE fails. Symbol e.g. TCS.NS */
async function fetchYahooCmp(yahooSymbol: string): Promise<{ cmp: number | null; previousClose: number | null }> {
  const { getQuoteCache, setQuoteCache } = await import("cached-db/client");
  const cached = (await getQuoteCache(yahooSymbol, "yahoo")) as { cmp: number | null; previousClose: number | null } | null;
  if (cached && cached.cmp != null) return cached;
  try {
    const { default: axios } = await import("axios");
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`;
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], Accept: "application/json" },
      validateStatus: (s) => s === 200,
    });
    const result = data?.chart?.result?.[0];
    const cmp =
      result?.meta?.regularMarketPrice != null
        ? Number(result.meta.regularMarketPrice)
        : result?.meta?.previousClose != null
          ? Number(result.meta.previousClose)
          : null;
    const previousClose =
      result?.meta?.previousClose != null ? Number(result.meta.previousClose) : null;
    if (cmp != null) {
      await setQuoteCache(yahooSymbol, "yahoo", { cmp, previousClose });
      console.log("[backend] Yahoo CMP", yahooSymbol, "cmp:", cmp);
    }
    return { cmp, previousClose };
  } catch (err) {
    console.warn("[backend] Yahoo fetch failed for", yahooSymbol, (err as Error).message);
    return { cmp: null, previousClose: null };
  }
}

/** Google Finance quote page: P/E and latest earnings (when NSE fails). */
async function fetchGooglePeAndEarnings(
  nseSymbol: string
): Promise<{ peRatio: number | null; latestEarnings: string | null }> {
  const { getQuoteCache, setQuoteCache } = await import("cached-db/client");
  const cached = (await getQuoteCache(nseSymbol, "google")) as {
    peRatio?: number | null;
    latestEarnings?: string | null;
  } | null;
  if (cached && (cached.peRatio != null || cached.latestEarnings != null)) {
    return {
      peRatio: cached.peRatio ?? null,
      latestEarnings: cached.latestEarnings ?? null,
    };
  }
  try {
    const { default: axios } = await import("axios");
    const url = `https://www.google.com/finance/quote/${encodeURIComponent(nseSymbol)}:NSE`;
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], Accept: "text/html" },
      validateStatus: (s) => s === 200,
      responseType: "text",
    });
    const html = typeof data === "string" ? data : "";
    let peRatio: number | null = null;
    let latestEarnings: string | null = null;

    const peMatch =
      html.match(/"trailingPe"\s*:\s*(\d+\.?\d*)/) ??
      html.match(/"peRatio"\s*:\s*(\d+\.?\d*)/i) ??
      html.match(/"P\/E"[^}]*?"(\d+\.?\d*)"/) ??
      html.match(/P\/E[\s\S]*?(\d+\.?\d+)/);
    if (peMatch?.[1]) {
      const n = Number(peMatch[1]);
      if (Number.isFinite(n) && n > 0 && n < 1e6) peRatio = n;
    }

    const earningsMatch =
      html.match(/"earningsDate"\s*:\s*"([^"]+)"/) ??
      html.match(/Earnings[^]*?(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
    if (earningsMatch?.[1]) latestEarnings = earningsMatch[1].trim();

    const out = { peRatio, latestEarnings };
    if (peRatio != null || latestEarnings != null) {
      await setQuoteCache(nseSymbol, "google", out);
      console.log("[backend] Google Finance", nseSymbol, "pe:", peRatio ?? "—", "earnings:", latestEarnings ?? "—");
    }
    return out;
  } catch (err) {
    console.warn("[backend] Google Finance fetch failed for", nseSymbol, (err as Error).message);
    return { peRatio: null, latestEarnings: null };
  }
}

/** NSE: browser-like headers + session cookie + delay. Falls back to Yahoo on 403. */
async function fetchQuote(nseSymbol: string): Promise<QuoteResult> {
  const { getQuoteCache, setQuoteCache } = await import("cached-db/client");
  const cached = (await getQuoteCache(nseSymbol, "nse")) as QuoteResult | null;
  if (cached && (cached.cmp != null || cached.previousClose != null)) {
    return cached;
  }

  let nseFailed = false;
  try {
    const { default: axios } = await import("axios");
    const { CookieJar } = await import("tough-cookie");
    const { wrapper } = await import("axios-cookiejar-support");

    const jar = new CookieJar();
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        timeout: 15000,
        headers: BROWSER_HEADERS,
      })
    );

    await client.get("https://www.nseindia.com");
    await new Promise((r) => setTimeout(r, 1500));
    const quotePage = `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(nseSymbol)}`;
    await client.get(quotePage);
    await new Promise((r) => setTimeout(r, 500));

    const resp = await client.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(nseSymbol)}`,
      { headers: { ...BROWSER_HEADERS, Referer: quotePage } }
    );
    const data = resp?.data;

    if (resp.status !== 200 || !data || typeof data !== "object") {
      console.warn("[backend] NSE unexpected response for", nseSymbol, "status:", resp.status);
      nseFailed = true;
    } else {
      const priceInfo = data?.priceInfo ?? {};
      const metadata = data?.metadata ?? {};
      const lastPrice = priceInfo.lastPrice;
      const previousClose = priceInfo.previousClose;
      let peRatio: number | null = null;
      const peRaw = metadata.pdSectorPe;
      if (peRaw != null && peRaw !== "N/A" && peRaw !== "") {
        const n = Number(peRaw);
        if (Number.isFinite(n)) peRatio = n;
      }
      const cmp = lastPrice != null ? Number(lastPrice) : null;
      const prev = previousClose != null ? Number(previousClose) : null;
      const out: QuoteResult = { cmp, previousClose: prev, peRatio, latestEarnings: null };
      if (cmp != null || prev != null) {
        await setQuoteCache(nseSymbol, "nse", out);
        console.log("[backend] NSE quote", nseSymbol, "cmp:", cmp, "pe:", peRatio ?? "—");
        return out;
      }
    }
  } catch (err) {
    console.warn("[backend] NSE fetch failed for", nseSymbol, (err as Error).message);
    nseFailed = true;
  }

  if (nseFailed) {
    console.log("[backend] NSE failed for", nseSymbol, "→ Yahoo (CMP) + Google (P/E, earnings)");
    const yahoo = await fetchYahooCmp(`${nseSymbol}.NS`);
    if (yahoo.cmp != null) {
      const google = await fetchGooglePeAndEarnings(nseSymbol);
      return {
        cmp: yahoo.cmp,
        previousClose: yahoo.previousClose,
        peRatio: google.peRatio,
        latestEarnings: google.latestEarnings,
      };
    }
  }

  return { cmp: null, previousClose: null, peRatio: null, latestEarnings: null };
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

  const enriched = await Promise.all(
    stocks.map(async (s) => {
      const investment = Number(s.investment);
      const qty = s.purchasedQuantity;
      const exchange = s.exchange ?? "NSE";
      const nseSymbol = toNseSymbol(s.symbol, exchange);

      const { cmp, peRatio, latestEarnings } = await fetchQuote(nseSymbol);

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
