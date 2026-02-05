import { Router } from "express";

const stocksRouter = Router();

stocksRouter.get("/", (_req, res) => {
  res.json([
    { symbol: "AAPL", price: 185.23 },
    { symbol: "GOOGL", price: 142.11 },
  ]);
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
