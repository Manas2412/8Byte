"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { EnrichedStock, PortfolioEnrichedPayload } from "./types";

/** Default interval for refreshing CMP, Present Value, and Gain/Loss (ms). */
export const DEFAULT_POLL_INTERVAL_MS = 15_000;

export type UsePortfolioWithUpdatesOptions = {
  /** Returns the auth token (e.g. from localStorage). */
  getToken: () => string | null;
  /** Base API URL. Default: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001" */
  apiUrl?: string;
  /** Refresh interval in ms. Default: 15000 (15 seconds). */
  intervalMs?: number;
};

export type UsePortfolioWithUpdatesResult = {
  stocks: EnrichedStock[];
  loading: boolean;
  error: string | null;
  /** Manually trigger a refresh. */
  refresh: () => Promise<void>;
};

async function fetchPortfolio(
  apiUrl: string,
  headers: HeadersInit
): Promise<EnrichedStock[]> {
  const enrichedRes = await fetch(`${apiUrl}/api/v1/stocks/portfolio-enriched`, {
    headers,
  });
  if (enrichedRes.ok) {
    const data = (await enrichedRes.json()) as PortfolioEnrichedPayload;
    return data.stocks ?? [];
  }
  if (enrichedRes.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  const cacheRes = await fetch(`${apiUrl}/api/v1/stocks/portfolio-cache`, {
    headers,
  });
  if (cacheRes.ok) {
    const data = (await cacheRes.json()) as PortfolioEnrichedPayload;
    return data.stocks ?? [];
  }
  if (cacheRes.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  const profileRes = await fetch(`${apiUrl}/api/v1/users/profile`, {
    headers,
  });
  if (profileRes.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!profileRes.ok) {
    const err = (await profileRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? "Failed to load profile");
  }
  const profile = (await profileRes.json()) as { stocks: EnrichedStock[] };
  return profile.stocks ?? [];
}

/**
 * Fetches portfolio once, then refetches at regular intervals so that
 * CMP, Present Value, and Gain/Loss update automatically (e.g. every 15 seconds).
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
    if (!token) return;
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
