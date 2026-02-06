import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4001);

// Minimal: only health so we can verify the server responds at all
app.get("/health", (req, res) => {
  console.log("[backend] GET /health");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "ok" }));
});

// Mount API only after server is listening so startup is instant
const server = app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
  // Load and mount API routes after first tick so /health can be hit immediately
  import("./routes/v1/index.js")
    .then((m) => {
      app.use("/api/v1", m.default);
      console.log("API /api/v1 ready");
    })
    .catch((err) => {
      console.error("[backend] Failed to load API routes:", err);
    });
});

// Keep process alive in Bun (otherwise it can exit after the listen callback)
if (typeof Bun !== "undefined") {
  setInterval(() => {}, 2147483647);
}

export default app;
