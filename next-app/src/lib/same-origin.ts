import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF guard for state-changing Route Handlers reached via same-origin
 * `fetch()` from a client component (see PHASE 7 Route Handler fallback).
 * Browsers always send `Origin` on same-origin POST/fetch requests; a
 * cross-origin page cannot forge it, so comparing its **host** against the
 * request's own Host (falling back to X-Forwarded-Host, same precedence
 * Next.js's own built-in Server Action origin check uses — see
 * https://nextjs.org/docs/app/guides/data-security#allowed-origins-advanced)
 * is sufficient — no extra env var to keep in sync with deployment URLs.
 *
 * Deliberately does NOT compare against `NextRequest.nextUrl.origin`
 * (protocol + host): behind a reverse proxy that terminates TLS upstream
 * (Render, in front of which sits Cloudflare — this app's actual production
 * topology), `nextUrl.origin` reflects the scheme Next.js's own server
 * constructed the request URL with, which is not guaranteed to be "https"
 * even though the real client request was — see the incident writeup for
 * how this previously caused every review-link/file-delete/cancel/comment
 * request in production to be rejected with a false-positive 403,
 * regardless of the Origin header being entirely legitimate. Comparing
 * only the host side-steps that scheme ambiguity entirely while still
 * rejecting genuine cross-origin requests (different host).
 */
export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  // No Origin header at all (e.g. a same-tab top-level navigation) is not
  // how these routes are ever called — they're only ever hit via fetch()
  // from client JS, which always sets it for POST requests.
  if (!origin) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }

  const requestHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  if (!requestHost || originHost !== requestHost) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }
  return null;
}
