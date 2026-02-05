import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT ?? 4001);

const server = app.listen(PORT, async () => {
  const { default: v1Router } = await import("./routes/v1/index.js");
  app.use("/api/v1", v1Router);
  console.log(`Backend server listening on http://localhost:${PORT}`);
});

// Keep process alive under Bun (it exits when the main script completes otherwise)
if (typeof Bun !== "undefined") {
  setInterval(() => {}, 2147483647);
}

export default app;

