// Only load .env when not set (e.g. Docker Compose sets DATABASE_URL, REDIS_URL)
import { createRequire } from "module";
const require = createRequire(import.meta.url);
if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  require("dotenv").config();
}
import express from "express";
import cors from "cors";
import v1Router from "./routes/v1/index.js";

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3001);

app.get("/health", (req, res) => {
  console.log("[backend] GET /health");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "ok" }));
});

app.use("/api/v1", v1Router);

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
  console.log("API /api/v1 ready");
  console.log("[backend] Rate limiting & safety: Cache responses (Redis / in-memory); limit requests (e.g. 1 request per symbol per minute); never scrape on every page load.");
});
export default app;
