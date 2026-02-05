import express from "express";
import v1Router from "./routes/v1/index.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1", v1Router);

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});

export default app;

