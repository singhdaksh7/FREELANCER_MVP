import { NextResponse } from "next/server";

/**
 * `requireAuthenticatedUser()`/`requireCreatorRole()` (src/data-access/auth.ts)
 * call Next's `redirect()` when there's no session — correct for Server
 * Components/Pages, but a route handler called via `fetch()` from client
 * JS should get a real 401 JSON response instead of a redirect its caller
 * has to specially unwrap. `redirect()` works by throwing an error with a
 * `NEXT_REDIRECT`-prefixed `digest`; detecting that here lets every route
 * handler in this app reuse the same data-access auth check without a
 * second, route-handler-specific auth helper.
 */
function isNextRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export interface ApiErrorMapping {
  [errorName: string]: { status: number; message?: string };
}

/**
 * Maps a caught error to a safe JSON error response. Never serializes a
 * raw error message unless it's from an explicitly-listed, known-safe
 * error class (see FILE_STORAGE_ARCHITECTURE.md "Security limitations") —
 * anything else is logged server-side and reduced to one generic message.
 */
export function apiErrorResponse(
  error: unknown,
  mapping: ApiErrorMapping,
  fallbackMessage = "Something went wrong. Please try again.",
): NextResponse {
  if (isNextRedirectError(error)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const name = error instanceof Error ? error.name : undefined;
  const matched = name ? mapping[name] : undefined;
  if (matched) {
    return NextResponse.json({ error: matched.message ?? (error as Error).message }, { status: matched.status });
  }

  console.error("API route error:", error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
