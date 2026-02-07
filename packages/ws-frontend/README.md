# ws-frontend

**Single responsibility:** poll dynamic stock data (CMP, Present value, Gain/Loss, P/E ratio) from the backend every 15 seconds. All other data and all updates (profile, add stock, etc.) go through the **backend-server**; this package is only for the 15 s polling layer.

## Frontend flow (high level)

- **sign-up → sign-in → user** (auth and navigation).
- **user → backend-server**: fetch all data (profile, portfolio), perform all updates (add stock, edit profile, etc.).
- **user → ws-frontend**: only poll dynamic data (CMP, present value, Gain/Loss, P/E) every 15 s (still fetched from backend; ws-frontend only runs the interval and updates UI state).

## Usage

```tsx
import { usePortfolioWithUpdates } from "ws-frontend";

function StocksPage() {
  const { stocks, loading, error, refresh } = usePortfolioWithUpdates({
    getToken: () => localStorage.getItem("token"),
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    intervalMs: 15_000, // optional; 15s is the default
  });
  // ...
}
```

## API

- **`usePortfolioWithUpdates(options)`** – Hook that polls the backend at `intervalMs` (default 15 s) and updates CMP, present value, gain/loss, P/E ratio in state. Does not replace the backend as the source for the rest of the data or for mutations.
- **`DEFAULT_POLL_INTERVAL_MS`** – `15000` (15 seconds).
- **`EnrichedStock`** – Type for a stock row including `cmp`, `presentValue`, `gainLoss`, `peRatio`, etc.
