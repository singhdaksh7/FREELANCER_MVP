/**
 * The combined worker's tiny HTTP server — GET /health and POST /wake —
 * factored out of combined-worker.ts so it can be unit-tested without a
 * real Prisma client, database, or job queue. Render Free only offers Web
 * Services (no free Background Workers), so this server exists purely to
 * give Render something to health-check and to let the web service
 * shorten the worker's idle-poll wait after queuing a job.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

export interface WakeServerOptions {
  /** Server-only shared secret; POST /wake is rejected (401) if unset or mismatched. */
  wakeSecret: string | undefined;
  /** Called once per accepted (rate-limit-passing, authenticated) /wake request. Never awaited by the request handler — the caller must not do job work here. */
  onWake: () => void;
  isShuttingDown: () => boolean;
  now?: () => number;
  /** Sliding-window rate limit on POST /wake, regardless of auth outcome. */
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
}

/** Constant-time secret comparison — never short-circuits on the first mismatched byte, and never throws on a length mismatch. */
export function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

export function createWakeServer(options: WakeServerOptions): Server {
  const now = options.now ?? Date.now;
  const rateLimitWindowMs = options.rateLimitWindowMs ?? 10_000;
  const rateLimitMaxRequests = options.rateLimitMaxRequests ?? 20;
  const requestTimestamps: number[] = [];
  const startedAt = now();

  function isRateLimited(): boolean {
    const t = now();
    while (requestTimestamps.length > 0 && t - requestTimestamps[0]! > rateLimitWindowMs) {
      requestTimestamps.shift();
    }
    if (requestTimestamps.length >= rateLimitMaxRequests) return true;
    requestTimestamps.push(t);
    return false;
  }

  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === "GET" && req.url === "/health") {
      // Only ever safe, coarse status — never a connection string, bucket
      // name, secret, or job payload.
      sendJson(res, 200, {
        status: options.isShuttingDown() ? "shutting_down" : "ok",
        uptimeSeconds: Math.floor((now() - startedAt) / 1000),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/wake") {
      if (!options.wakeSecret || !secretMatches(req.headers["x-worker-wake-secret"] as string | undefined, options.wakeSecret)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }

      if (isRateLimited()) {
        sendJson(res, 429, { error: "rate_limited" });
        return;
      }

      // Drain the request body without acting on its contents, then
      // respond immediately — the actual job claim/process happens on the
      // worker's own loop, never inside this request handler.
      req.resume();
      sendJson(res, 202, { status: "accepted" });
      options.onWake();
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  }

  return createServer(handleRequest);
}
