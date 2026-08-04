import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { assertSameOrigin } from "./same-origin";

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/workspaces/ws_1/review-link/regenerate", {
    method: "POST",
    headers,
  });
}

describe("assertSameOrigin", () => {
  it("rejects a request with no Origin header", () => {
    const response = assertSameOrigin(makeRequest({ host: "app.example.com" }));
    expect(response?.status).toBe(403);
  });

  it("rejects a genuinely cross-origin request", () => {
    const response = assertSameOrigin(
      makeRequest({ origin: "https://evil.example.com", host: "app.example.com" }),
    );
    expect(response?.status).toBe(403);
  });

  it("rejects when the Origin header is malformed", () => {
    const response = assertSameOrigin(makeRequest({ origin: "not-a-url", host: "app.example.com" }));
    expect(response?.status).toBe(403);
  });

  it("allows a same-host request when Origin and Host use the same scheme", () => {
    const response = assertSameOrigin(
      makeRequest({ origin: "https://app.example.com", host: "app.example.com" }),
    );
    expect(response).toBeNull();
  });

  it(
    "allows a same-host request behind a reverse proxy that terminates TLS upstream, " +
      "even though the request's own resolved nextUrl scheme is http — this is the exact " +
      "production topology (Render behind Cloudflare) that caused every review-link/" +
      "file-delete/cancel/comment request to be falsely rejected",
    () => {
      const response = assertSameOrigin(
        makeRequest({
          origin: "https://inlay-mvp-demo.onrender.com",
          host: "inlay-mvp-demo.onrender.com",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "inlay-mvp-demo.onrender.com",
        }),
      );
      expect(response).toBeNull();
    },
  );

  it("prefers X-Forwarded-Host over Host when both are present and differ", () => {
    const response = assertSameOrigin(
      makeRequest({
        origin: "https://public.example.com",
        host: "internal-service:10000",
        "x-forwarded-host": "public.example.com",
      }),
    );
    expect(response).toBeNull();
  });
});
