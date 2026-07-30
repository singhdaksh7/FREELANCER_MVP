import { describe, expect, it, vi, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import { createWakeServer, secretMatches } from "./combined-worker-server";

async function listen(server: ReturnType<typeof createWakeServer>): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

function close(server: ReturnType<typeof createWakeServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("secretMatches", () => {
  it("returns true only for an exact match", () => {
    expect(secretMatches("correct-secret", "correct-secret")).toBe(true);
  });

  it("returns false for a mismatch, a missing header, and a different-length value", () => {
    expect(secretMatches("wrong", "correct-secret")).toBe(false);
    expect(secretMatches(undefined, "correct-secret")).toBe(false);
    expect(secretMatches("short", "a-much-longer-secret-value")).toBe(false);
  });
});

describe("createWakeServer", () => {
  const servers: ReturnType<typeof createWakeServer>[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close));
  });

  function makeServer(overrides: Partial<Parameters<typeof createWakeServer>[0]> = {}) {
    const server = createWakeServer({
      wakeSecret: "test-secret",
      onWake: vi.fn(),
      isShuttingDown: () => false,
      ...overrides,
    });
    servers.push(server);
    return server;
  }

  it("GET /health returns 200 with only coarse, safe status fields", async () => {
    const server = makeServer();
    const port = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", uptimeSeconds: expect.any(Number) });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/postgres|s3|bucket|secret|key/i);
  });

  it("GET /health reports shutting_down once isShuttingDown() is true", async () => {
    const server = makeServer({ isShuttingDown: () => true });
    const port = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    expect(body.status).toBe("shutting_down");
  });

  it("POST /wake without a secret header is rejected with 401 and does not trigger onWake", async () => {
    const onWake = vi.fn();
    const server = makeServer({ onWake });
    const port = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/wake`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(onWake).not.toHaveBeenCalled();
  });

  it("POST /wake with an invalid secret is rejected with 401 and does not trigger onWake", async () => {
    const onWake = vi.fn();
    const server = makeServer({ onWake });
    const port = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/wake`, {
      method: "POST",
      headers: { "X-Worker-Wake-Secret": "wrong-secret" },
    });
    expect(res.status).toBe(401);
    expect(onWake).not.toHaveBeenCalled();
  });

  it("POST /wake is rejected with 401 when no wakeSecret is configured server-side, even if a header is sent", async () => {
    const onWake = vi.fn();
    const server = makeServer({ wakeSecret: undefined, onWake });
    const port = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/wake`, {
      method: "POST",
      headers: { "X-Worker-Wake-Secret": "anything" },
    });
    expect(res.status).toBe(401);
    expect(onWake).not.toHaveBeenCalled();
  });

  it("POST /wake with a valid secret returns 202 and triggers onWake exactly once", async () => {
    const onWake = vi.fn();
    const server = makeServer({ onWake });
    const port = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/wake`, {
      method: "POST",
      headers: { "X-Worker-Wake-Secret": "test-secret" },
    });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body).toEqual({ status: "accepted" });
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("rate-limits repeated /wake calls beyond the configured window", async () => {
    const onWake = vi.fn();
    const server = makeServer({ onWake, rateLimitWindowMs: 10_000, rateLimitMaxRequests: 3 });
    const port = await listen(server);

    const responses = [];
    for (let i = 0; i < 5; i++) {
      responses.push(
        await fetch(`http://127.0.0.1:${port}/wake`, {
          method: "POST",
          headers: { "X-Worker-Wake-Secret": "test-secret" },
        }),
      );
    }

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 202)).toHaveLength(3);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
    expect(onWake).toHaveBeenCalledTimes(3);
  });

  it("an unknown route returns 404", async () => {
    const server = makeServer();
    const port = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
  });
});
