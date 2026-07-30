import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Secure client-review link tokens — see REVIEW_TOKEN_SECURITY.md for the
 * full design rationale. A raw token is generated with 256 bits of
 * entropy, shown to the creator exactly once, and never persisted
 * anywhere — only its SHA-256 hash is stored (`ReviewLink.tokenHash`).
 */

/** base64url alphabet, 40-50 chars covers a 32-byte (256-bit) value's ~43-char encoding with margin. */
const TOKEN_SHAPE_REGEX = /^[A-Za-z0-9_-]{40,50}$/;

/** Generates a new raw token — 256 bits of cryptographically secure randomness, base64url-encoded. */
export function generateReviewToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest of a raw token — the only form ever written to PostgreSQL. */
export function hashReviewToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** First 8 chars of the raw token — safe to store/display for support identification only; not sufficient to reconstruct the token. */
export function reviewTokenPrefix(rawToken: string): string {
  return rawToken.slice(0, 8);
}

/**
 * Rejects a malformed token before it ever reaches the database — cheap,
 * in-process, no timing signal about whether any real token matches.
 */
export function isValidReviewTokenShape(candidate: string): boolean {
  return TOKEN_SHAPE_REGEX.test(candidate);
}

/**
 * Constant-time hex-digest comparison. Defense-in-depth only: the primary
 * lookup path (`prisma.reviewLink.findUnique({ where: { tokenHash } })`)
 * uses a unique index and never compares two secrets byte-by-byte in
 * application memory, so this isn't load-bearing for that path — but it's
 * provided for any future code path that ends up comparing two hashes
 * directly, per the brief's "use constant-time comparison where
 * applicable."
 */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
