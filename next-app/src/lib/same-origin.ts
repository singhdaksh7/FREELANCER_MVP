import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF guard for state-changing Route Handlers reached via same-origin
 * `fetch()` from a client component (see PHASE 7 Route Handler fallback).
 * Browsers always send `Origin` on same-origin POST/fetch requests; a
 * cross-origin page cannot forge it, so comparing it against the request's
 * own resolved origin (derived from the Host header Next.js already
 * trusts for `NextRequest.nextUrl`) is sufficient — no extra env var to
 * keep in sync with deployment URLs.
 */
export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  // No Origin header at all (e.g. a same-tab top-level navigation) is not
  // how these routes are ever called — they're only ever hit via fetch()
  // from client JS, which always sets it for POST requests.
  if (!origin) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }
  if (origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }
  return null;
}
