"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { EnrichedStock, PortfolioEnrichedPayload } from "./types";

/** Default interval for refreshing CMP, Present Value, and Gain/Loss (ms). */
export const DEFAULT_POLL_INTERVAL_MS = 15_000;

export type UsePortfolioWithUpdatesOptions = {
  getToken: () => string | null;
  apiUrl?: string;
  intervalMs?: number;
};

export type UsePortfolioWithUpdatesResult = {
  stocks: EnrichedStock[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const RETRY_AFTER_202_ATTEMPTS = 6;
const RETRY_AFTER_202_DELAY_MS = 2000;

/** Ensure every stock has presentValue and gainLoss for display (derive from investment if missing). */
function normalizeStocks(
  rows: Array<Record<string, unknown> & { investment?: number; presentValue?: number; gainLoss?: number }>
): EnrichedStock[] {
  return rows.map((row) => {
    const inv = Number(row.investment ?? 0);
    const pv = row.presentValue != null ? Number(row.presentValue) : inv;
    const gl = row.gainLoss != null ? Number(row.gainLoss) : 0;
    return {
      ...row,
      investment: inv,
      presentValue: pv,
      gainLoss: gl,
    } as EnrichedStock;
  });
}

async function fetchPortfolio(
  apiUrl: string,
  headers: HeadersInit
): Promise<EnrichedStock[]> {
  let enrichedRes: Response;
  try {
    enrichedRes = await fetch(`${apiUrl}/api/v1/stocks/portfolio-enriched`, {
      headers,
      cache: "no-store",
      credentials: "include",
    });
  } catch (networkErr) {
    const profileRes = await fetch(`${apiUrl}/api/v1/users/profile`, {
      headers,
      cache: "no-store",
      credentials: "include",
    });
    if (profileRes.status === 401) throw new Error("UNAUTHORIZED");
    if (!profileRes.ok) throw new Error("Failed to load profile");
    const profile = (await profileRes.json()) as { stocks?: Array<Record<string, unknown> & { investment?: number }> };
    const raw = profile.stocks ?? [];
    return normalizeStocks(
      raw.map((s) => ({ ...s, investment: s.investment ?? 0, presentValue: s.investment, gainLoss: 0 }))
    );
  }
  if (enrichedRes.ok) {
    const data = (await enrichedRes.json()) as PortfolioEnrichedPayload;
    const raw = data.stocks ?? [];
    return normalizeStocks(raw);
  }
  if (enrichedRes.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (enrichedRes.status === 202) {
    for (let i = 0; i < RETRY_AFTER_202_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, RETRY_AFTER_202_DELAY_MS));
      const retryRes = await fetch(`${apiUrl}/api/v1/stocks/portfolio-enriched`, {
        headers,
        cache: "no-store",
        credentials: "include",
      });
      if (retryRes.ok) {
        const data = (await retryRes.json()) as PortfolioEnrichedPayload;
        return normalizeStocks(data.stocks ?? []);
      }
      if (retryRes.status === 401) throw new Error("UNAUTHORIZED");
    }
  }

  const cacheRes = await fetch(`${apiUrl}/api/v1/stocks/portfolio-cache`, {
    headers,
    cache: "no-store",
    credentials: "include",
  });
  if (cacheRes.ok) {
    const data = (await cacheRes.json()) as PortfolioEnrichedPayload;
    return normalizeStocks(data.stocks ?? []);
  }
  if (cacheRes.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  const profileRes = await fetch(`${apiUrl}/api/v1/users/profile`, {
    headers,
    cache: "no-store",
    credentials: "include",
  });
  if (profileRes.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!profileRes.ok) {
    const err = (await profileRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? "Failed to load profile");
  }
  const profile = (await profileRes.json()) as {
    stocks: Array<{
      id?: string;
      stockName: string;
      symbol?: string;
      industry?: string | null;
      investment: number;
      purchasePrice?: number;
      quantity?: number;
      portfolioPercent?: number;
      exchange?: string;
    }>;
  };
  const raw = profile.stocks ?? [];
  return normalizeStocks(
    raw.map((s) => ({ ...s, investment: s.investment ?? 0, presentValue: s.investment, gainLoss: 0 }))
  );
}

/**
 * Fetches portfolio once, then refetches at regular intervals so that
 * CMP, Present Value, and Gain/Loss update automatically.
 */
export function usePortfolioWithUpdates(
  options: UsePortfolioWithUpdatesOptions
): UsePortfolioWithUpdatesResult {
  const {
    getToken,
    apiUrl = "http://localhost:3001",
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = options;

  const [stocks, setStocks] = useState<EnrichedStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runFetch = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const headers: HeadersInit = { Authorization: `Bearer ${token}` };
    try {
      const next = await fetchPortfolio(apiUrl, headers);
      setStocks(next);
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.message === "UNAUTHORIZED") {
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          window.location.href = "/sign-in";
        }
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, [getToken, apiUrl]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await runFetch();
  }, [runFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await runFetch();
      if (cancelled) return;
      intervalRef.current = setInterval(runFetch, intervalMs);
    })();
    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runFetch, intervalMs]);

  return { stocks, loading, error, refresh };
}
