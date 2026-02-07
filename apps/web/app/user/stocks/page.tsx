"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { Button } from "@/app/components/ui/button";
// ws-frontend: only for 15s poll of CMP, present value, Gain/Loss, P/E (see FRONTEND_FLOW.md)
import { usePortfolioWithUpdates } from "ws-frontend";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Must match StockIndustry enum in schema.prisma */
const STOCK_INDUSTRIES = [
  "Healthcare",
  "Finance",
  "Technology",
  "Energy",
  "Consumer",
  "Materials",
  "Utilities",
] as const;

const INDUSTRY_FILTER_ALL = "All";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(n);
}

function formatPercent(n: number): string {
  return `${n.toFixed(2)}%`;
}

export default function UserStocksPage() {
  const [industryFilter, setIndustryFilter] = useState<string>(INDUSTRY_FILTER_ALL);

  // Dynamic data (CMP, PV, G/L, P/E) from backend every 15s; rest of data/updates via backend-server
  const { stocks, loading, error, refresh } = usePortfolioWithUpdates({
    getToken,
    apiUrl: API_URL,
    intervalMs: 15_000,
  });

  const filteredStocks =
    industryFilter === INDUSTRY_FILTER_ALL
      ? stocks
      : stocks.filter((row) => {
          const rowIndustry = (row.industry ?? "Technology").trim().toLowerCase();
          const filterValue = industryFilter.trim().toLowerCase();
          return rowIndustry === filterValue;
        });

  const showSectorSummary = industryFilter !== INDUSTRY_FILTER_ALL;
  const sectorTotals =
    showSectorSummary && filteredStocks.length > 0
      ? filteredStocks.reduce(
          (acc, row) => {
            const inv = row.investment ?? 0;
            const pv = row.presentValue ?? inv;
            const gl = row.gainLoss ?? (pv - inv);
            return {
              totalInvestment: acc.totalInvestment + inv,
              totalPresentValue: acc.totalPresentValue + pv,
              totalGainLoss: acc.totalGainLoss + gl,
            };
          },
          { totalInvestment: 0, totalPresentValue: 0, totalGainLoss: 0 }
        )
      : null;

  if (loading) {
    return <p className="text-white/90">Loading…</p>;
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-white/90">{error}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-white/30 text-white w-fit"
            onClick={() => refresh()}
          >
            Retry
          </Button>
          {error === "UNAUTHORIZED" && (
            <Button asChild variant="outline" className="border-white/30 text-white w-fit">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const colCount = 10;

  return (
    <div className="text-white p-[15px]">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-semibold text-white/95">Stocks</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="industry-filter" className="text-sm text-white/80">
            Industry
          </label>
          <select
            id="industry-filter"
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="rounded-md border border-white/20 bg-[#2a2a2a] px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/20 min-w-[140px]"
            aria-label="Filter by industry"
          >
            <option value={INDUSTRY_FILTER_ALL} className="bg-[#2a2a2a] text-white">
              All
            </option>
            {STOCK_INDUSTRIES.map((ind) => (
              <option key={ind} value={ind} className="bg-[#2a2a2a] text-white">
                {ind}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showSectorSummary && (
        <div className="rounded-lg border border-white/20 bg-[#2a2a2a] p-5 mb-6">
          <h2 className="text-lg font-semibold text-white/95 mb-4">
            {industryFilter} — Sector summary
          </h2>
          {sectorTotals ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1">
                  Total investment
                </p>
                <p className="text-white/95 font-medium">
                  {formatCurrency(sectorTotals.totalInvestment)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1">
                  Total present value
                </p>
                <p className="text-white/95 font-medium">
                  {formatCurrency(sectorTotals.totalPresentValue)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1">
                  Total gain/loss
                </p>
                <p
                  className={
                    sectorTotals.totalGainLoss >= 0
                      ? "text-emerald-400 font-medium"
                      : "text-red-400 font-medium"
                  }
                >
                  {sectorTotals.totalGainLoss >= 0 ? "+" : ""}
                  {formatCurrency(sectorTotals.totalGainLoss)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-white/70">Information for this specific industry not present.</p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-white/20 overflow-hidden bg-[#2a2a2a]">
        <Table>
          <TableHeader>
            <TableRow className="border-white/20 hover:bg-white/5">
              <TableHead className="text-white/90 font-medium">Stock name</TableHead>
              <TableHead className="text-white/90 font-medium text-right">Purchase price</TableHead>
              <TableHead className="text-white/90 font-medium text-right">QTY</TableHead>
              <TableHead className="text-white/90 font-medium text-right">Investment</TableHead>
              <TableHead className="text-white/90 font-medium text-right">Portfolio %</TableHead>
              <TableHead className="text-white/90 font-medium text-center">NSE/BSE</TableHead>
              <TableHead className="text-white/90 font-medium text-right">CMP</TableHead>
              <TableHead className="text-white/90 font-medium text-right">Present value</TableHead>
              <TableHead className="text-white/90 font-medium text-right">P/E Ratio</TableHead>
              <TableHead className="text-white/90 font-medium text-right">Gain/Loss</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStocks.length === 0 ? (
              <TableRow className="border-white/20 hover:bg-white/5">
                <TableCell
                  colSpan={colCount}
                  className="text-white/70 text-center py-8"
                >
                  {stocks.length === 0
                    ? "No stocks in your portfolio yet."
                    : `No stocks in ${industryFilter}.`}
                </TableCell>
              </TableRow>
            ) : (
              filteredStocks.map((row) => (
                <TableRow
                  key={`${row.stockName}-${row.investment}`}
                  className="border-white/20 hover:bg-white/5"
                >
                  <TableCell className="font-medium text-white/95">
                    {row.stockName}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {row.purchasePrice != null
                      ? formatCurrency(row.purchasePrice)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {row.quantity != null ? row.quantity : "—"}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {formatCurrency(row.investment)}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {row.portfolioPercent != null
                      ? formatPercent(row.portfolioPercent)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center text-white/90">
                    {row.exchange ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {row.cmp != null ? formatCurrency(row.cmp) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {row.presentValue != null
                      ? formatCurrency(row.presentValue)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {row.peRatio != null ? row.peRatio.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {row.gainLoss != null ? (
                      <span
                        className={
                          row.gainLoss >= 0 ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {row.gainLoss >= 0 ? "+" : ""}
                        {formatCurrency(row.gainLoss)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
