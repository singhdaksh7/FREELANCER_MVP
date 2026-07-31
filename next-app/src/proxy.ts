import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Optimistic route protection (layer 1 of 2 — see
 * AUTH_DATABASE_ARCHITECTURE.md). Reads/verifies the JWT session cookie
 * only; it never queries Postgres. This exists purely to redirect fast,
 * before any Server Component renders — the *authoritative* check lives
 * in the creator route group's layout and in every data-access function
 * (src/data-access/*), which independently re-verify the session and
 * scope every query to the authenticated creator. Never treat this file
 * as sufficient protection on its own.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/workspaces", "/payments", "/notifications", "/admin"];
const AUTH_ONLY_PAGES = new Set(["/login", "/register"]);

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isAuthenticated = !!request.auth?.user;

  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (AUTH_ONLY_PAGES.has(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
