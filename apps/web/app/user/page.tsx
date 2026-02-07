"use client";

import { useState, useEffect } from "react";
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
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
// ws-frontend: only for 15s poll of CMP, present value, Gain/Loss, P/E (see FRONTEND_FLOW.md)
import { usePortfolioWithUpdates, type EnrichedStock } from "ws-frontend";

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

type ProfileStock = {
  stockName: string;
  symbol?: string;
  investment: number;
  purchasePrice?: number;
  quantity?: number;
  portfolioPercent?: number;
  exchange?: string;
};

type Profile = {
  id: string;
  name: string;
  email: string;
  stocks: ProfileStock[];
  totalInvestment: number;
};

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

export default function UserPage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [stockName, setStockName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [industry, setIndustry] = useState<string>(STOCK_INDUSTRIES[2]); // Technology
  const [purchasePrice, setPurchasePrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Dynamic data (CMP, PV, G/L, P/E) from backend every 15s; all other data/updates via backend-server
  const { stocks: tableStocks, loading: stocksLoading, error: stocksError, refresh } = usePortfolioWithUpdates({
    getToken,
    apiUrl: API_URL,
    intervalMs: 15_000,
  });

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const headers: HeadersInit = { Authorization: `Bearer ${token}` };

    (async () => {
      try {
        const profileRes = await fetch(`${API_URL}/api/v1/users/profile`, {
          headers,
        });
        if (profileRes.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/sign-in";
          return;
        }
        if (!profileRes.ok) {
          const data = await profileRes.json().catch(() => ({}));
          setError(data.message ?? "Failed to load profile");
          setProfileLoading(false);
          return;
        }
        const profile: Profile = await profileRes.json();
        setUser(profile);
      } catch {
        setError("Network error. Is the backend running?");
      } finally {
        setProfileLoading(false);
      }
    })();
  }, []);

  const loading = profileLoading || (!!user && stocksLoading);
  const displayError = error ?? stocksError;

  const handleAddStockSave = async () => {
    const token = getToken();
    if (!token) return;
    const price = parseFloat(purchasePrice);
    const qty = parseInt(quantity, 10);
    if (!stockName.trim() || !symbol.trim() || !Number.isFinite(price) || price <= 0 || !Number.isInteger(qty) || qty <= 0) {
      setAddError("Please fill all fields with valid values.");
      return;
    }
    setAddError(null);
    setAddSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/stocks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: stockName.trim(),
          symbol: symbol.trim(),
          industry: STOCK_INDUSTRIES.includes(industry as (typeof STOCK_INDUSTRIES)[number])
            ? industry
            : "Technology",
          purchasePrice: price,
          quantity: qty,
        }),
      });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
      if (!res.ok) {
        const msg = data?.message ?? data?.error ?? `Failed to add stock (${res.status})`;
        setAddError(msg);
        return;
      }
      setAddStockOpen(false);
      setStockName("");
      setSymbol("");
      setIndustry(STOCK_INDUSTRIES[2]);
      setPurchasePrice("");
      setQuantity("");
      await refresh();
    } catch {
      setAddError("Network error");
    } finally {
      setAddSaving(false);
    }
  };

  const handleAddStockCancel = () => {
    setAddStockOpen(false);
    setAddError(null);
    setStockName("");
    setSymbol("");
    setIndustry(STOCK_INDUSTRIES[2]);
    setPurchasePrice("");
    setQuantity("");
  };

  const handleDeleteStockClick = () => {
    setIsDeleteMode(true);
    setSelectedSymbols(new Set());
    setDeleteError(null);
  };

  const handleCancelDeleteClick = () => {
    setIsDeleteMode(false);
    setSelectedSymbols(new Set());
    setDeleteError(null);
  };

  const toggleStockSelection = (symbol: string) => {
    const key = symbol.toUpperCase();
    setSelectedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const symbols = Array.from(selectedSymbols);
    if (symbols.length === 0) return;
    const token = getToken();
    if (!token) return;
    setDeleteError(null);
    setDeleteSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/stocks`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError((data as { message?: string }).message ?? "Failed to delete stocks");
        return;
      }
      setIsDeleteMode(false);
      setSelectedSymbols(new Set());
      await refresh();
    } catch {
      setDeleteError("Network error");
    } finally {
      setDeleteSaving(false);
    }
  };

  if (loading) {
    return <p className="text-white/90">Loading…</p>;
  }

  if (displayError || !user) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-white/90">{displayError ?? "User not found"}</p>
        <div className="flex gap-2">
          {user !== undefined && (
            <Button
              variant="outline"
              className="border-white/30 text-white w-fit"
              onClick={() => refresh()}
            >
              Retry
            </Button>
          )}
          <Button asChild variant="outline" className="border-white/30 text-white w-fit">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-white p-[15px]">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-semibold text-white/95">
          Hello, {user.name}
        </h1>
        <div className="flex items-center gap-2">
          {!isDeleteMode ? (
            <>
              <Button
                type="button"
                onClick={() => {
                  setAddError(null);
                  setAddStockOpen(true);
                }}
                className="bg-[#4AA336] hover:bg-[#3d8a2e] text-white"
              >
                Add Stock
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDeleteStockClick}
                className="border-white/30 text-white hover:bg-white/10"
              >
                Delete Stock
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelDeleteClick}
                className="border-white/30 text-white hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedSymbols.size === 0 || deleteSaving}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteSaving ? "Deleting…" : "Delete"}
              </Button>
            </>
          )}
        </div>
      </div>
      {deleteError && (
        <p className="text-sm text-red-400 mb-4">{deleteError}</p>
      )}

      {addStockOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleAddStockCancel()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-stock-title"
        >
          <div
            className="w-full max-w-md p-6 rounded-xl border border-white/20 bg-[#2a2a2a] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-stock-title" className="text-lg font-semibold text-white/95 mb-4">
              Add Stock
            </h2>
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label className="text-white/80">Stock name</Label>
                <Input
                  value={stockName}
                  onChange={(e) => setStockName(e.target.value)}
                  placeholder="e.g. Tata Consultancy Services"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Symbol</Label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="e.g. TCS"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Industry</Label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                  aria-label="Industry"
                >
                  {STOCK_INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind} className="bg-[#2a2a2a] text-white">
                      {ind}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Purchase price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
              {addError && <p className="text-sm text-red-400">{addError}</p>}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddStockCancel}
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleAddStockSave}
                  disabled={addSaving}
                  className="bg-[#4AA336] hover:bg-[#3d8a2e] text-white"
                >
                  {addSaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-white/20 overflow-hidden bg-[#2a2a2a]">
        <Table>
          <TableHeader>
            <TableRow className="border-white/20 hover:bg-white/5">
              {isDeleteMode && (
                <TableHead className="text-white/90 font-medium w-10">
                  Select
                </TableHead>
              )}
              <TableHead className="text-white/90 font-medium">Stock</TableHead>
              <TableHead className="text-white/90 font-medium text-right">
                Total investment
              </TableHead>
              <TableHead className="text-white/90 font-medium text-right">
                Present value
              </TableHead>
              <TableHead className="text-white/90 font-medium text-right">
                Gain/Loss
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableStocks.length === 0 ? (
              <TableRow className="border-white/20 hover:bg-white/5">
                <TableCell
                  colSpan={isDeleteMode ? 5 : 4}
                  className="text-white/70 text-center py-8"
                >
                  No stocks in your portfolio yet.
                </TableCell>
              </TableRow>
            ) : (
              tableStocks.map((row: EnrichedStock) => (
                <TableRow
                  key={row.id ?? `${row.stockName}-${row.investment}`}
                  className="border-white/20 hover:bg-white/5"
                >
                  {isDeleteMode && (
                    <TableCell className="w-10">
                      <input
                        type="checkbox"
                        checked={row.symbol ? selectedSymbols.has(row.symbol.toUpperCase()) : false}
                        onChange={() => row.symbol && toggleStockSelection(row.symbol!)}
                        className="rounded border-white/30 bg-white/10 text-[#4AA336] focus:ring-white/20 cursor-pointer"
                        aria-label={`Select ${row.stockName}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium text-white/95">
                    {row.stockName}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {formatCurrency(row.investment)}
                  </TableCell>
                  <TableCell className="text-right text-white/90">
                    {row.presentValue != null
                      ? formatCurrency(row.presentValue)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
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
                      <span className="text-white/90">—</span>
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
