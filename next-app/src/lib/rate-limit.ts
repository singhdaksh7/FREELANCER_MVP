import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Minimal PostgreSQL-backed rate limiter — see PAYMENT_ARCHITECTURE.md
 * "Rate limiting." Deliberately not per-process memory: this app's
 * intended deployment can run more than one Next.js server instance, and
 * an in-memory counter would let each instance independently allow its
 * own quota. Backed by RateLimitAttempt (prisma/schema.prisma).
 */

export class RateLimitExceededError extends Error {
  constructor(message = "Too many requests. Please try again shortly.") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

export interface RateLimitOptions {
  /** Logical bucket name — scopes the limit to one endpoint family, e.g. "payment-order-create". */
  bucket: string;
  /** The raw identifier to scope by (a review/download token, an IP address, a payment id) — hashed before storage/comparison, never stored raw. */
  identifier: string;
  max: number;
  windowSeconds: number;
}

function hashIdentifier(bucket: string, identifier: string): string {
  // Bucket-salted so the same identifier hashes differently per bucket —
  // a leaked hash from one bucket's rows can't be correlated against
  // another bucket's rows for the same underlying identifier.
  return createHash("sha256").update(`${bucket}:${identifier}`).digest("hex");
}

/**
 * Records one attempt and throws RateLimitExceededError if the caller has
 * already made `max` attempts in the trailing `windowSeconds`. Called
 * before the guarded operation runs — a rejected attempt is still
 * recorded, so a caller can't dodge the limit by having its own request
 * fail after the check.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<void> {
  const identifierHash = hashIdentifier(options.bucket, options.identifier);
  const windowStart = new Date(Date.now() - options.windowSeconds * 1000);

  const count = await prisma.rateLimitAttempt.count({
    where: { bucket: options.bucket, identifierHash, createdAt: { gte: windowStart } },
  });

  if (count >= options.max) {
    throw new RateLimitExceededError();
  }

  await prisma.rateLimitAttempt.create({ data: { bucket: options.bucket, identifierHash } });

  // Opportunistic, targeted cleanup — deletes this identifier's own
  // now-stale rows on every check, so the table never grows unbounded for
  // an active caller without needing a separate scheduled job. A
  // best-effort operation: failure here must never block the rate-limit
  // decision itself.
  prisma.rateLimitAttempt
    .deleteMany({ where: { bucket: options.bucket, identifierHash, createdAt: { lt: windowStart } } })
    .catch(() => {});
}

/** Privacy-conscious IP identifier — truncates to the /24 (IPv4) or /48 (IPv6)-ish network portion so this module never persists (even hashed) a single individual's exact address as the sole distinguishing key. */
export function networkScopedIp(ip: string): string {
  if (ip.includes(":")) {
    // IPv6 — keep the first 3 hextets (~/48).
    return ip.split(":").slice(0, 3).join(":");
  }
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  return ip;
}

/** Best-effort client IP extraction from standard proxy headers — never trusted as an identity, only as a rate-limit scoping hint. */
export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Same extraction as {@link getClientIpFromHeaders}, for callers that hold a Request rather than a next/headers() Headers object. */
export function getClientIp(request: Request): string {
  return getClientIpFromHeaders(request.headers);
}
