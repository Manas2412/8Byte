import "dotenv/config";
import express from "express";
import cors from "cors";
import v1Router from "./routes/v1/index.js";

const app = express();
app.use(cors());
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
});
export default app;
