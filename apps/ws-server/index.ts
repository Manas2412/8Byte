import "dotenv/config";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "backend-common/config";
import { pushPortfolioRefreshToStream } from "cached-db/client";
import { startPortfolioRefreshJob } from "./refreshJob.js";
import { startPortfolioQueueWorker } from "./queueWorker.js";

const HTTP_PORT = Number(process.env.WS_HTTP_PORT ?? 8081);
const WS_PORT = Number(process.env.WS_PORT ?? 8080);

// ----- HTTP API: enqueue refresh (worker processes batch-wise to avoid API overload) -----
Bun.serve({
  port: HTTP_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/refresh-portfolio") {
      let body: { userId?: string };
      try {
        body = (await req.json()) as { userId?: string };
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      const userId = body.userId;
      if (!userId || typeof userId !== "string") {
        return new Response(
          JSON.stringify({ error: "userId required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const messageId = await pushPortfolioRefreshToStream(userId);
        if (!messageId) {
          return new Response(
            JSON.stringify({ error: "Redis unavailable" }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ queued: true, userId, messageId }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error("[ws-server] /refresh-portfolio error:", err);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`📡 WS-server HTTP API on http://localhost:${HTTP_PORT}`);

// ----- Queue worker: consumes stream in batches, delay between batches to avoid Yahoo/Google rate limit -----
startPortfolioQueueWorker();

// ----- 15s job: pushes user ids to same stream (worker processes them batch-wise) -----
startPortfolioRefreshJob();

// ----- WebSocket server (separate port from HTTP) -----
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`🚀 WebSocket server on ws://localhost:${WS_PORT}`);

wss.on("connection", function connection(ws, request) {
  console.log("🔗 Client connected");

  const url = request.url;
  if (!url) {
    return;
  }

  const queryParams = new URLSearchParams(url.split("?")[1]);
  const token = queryParams.get("token") || "";

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") {
      ws.close();
      return;
    }
    if (!decoded || !(decoded as { userId?: string }).userId) {
      ws.close();
      return;
    }
  } catch {
    ws.close();
    return;
  }

  ws.on("message", function message(data) {
    console.log("📩 Received message:", data.toString());
    ws.send("pong");
  });
});
