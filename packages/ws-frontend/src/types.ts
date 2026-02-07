/**
 * Stock row with enriched live data (CMP, present value, gain/loss).
 * CMP, presentValue, and gainLoss are updated at regular intervals (e.g. every 15s).
 */
export type EnrichedStock = {
  id?: string;
  stockName: string;
  symbol?: string;
  industry?: string | null;
  investment: number;
  purchasePrice?: number;
  quantity?: number;
  portfolioPercent?: number;
  exchange?: string;
  cmp?: number;
  presentValue?: number;
  gainLoss?: number;
  peRatio?: number;
  latestEarnings?: string;
};

export type PortfolioEnrichedPayload = {
  stocks: EnrichedStock[];
  totalInvestment?: number;
  cachedAt?: string;
};
