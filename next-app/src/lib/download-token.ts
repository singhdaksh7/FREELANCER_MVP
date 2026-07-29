import { randomBytes, createHash } from "node:crypto";

/**
 * Secure download-grant tokens — see SECURE_DOWNLOAD_ARCHITECTURE.md
 * "Grant entropy." Same 256-bit/base64url/SHA-256 scheme as
 * src/lib/review-token.ts, deliberately kept as an entirely separate
 * token space — a download token is never derived from, or interchangeable
 * with, a review token.
 */

const TOKEN_SHAPE_REGEX = /^[A-Za-z0-9_-]{40,50}$/;

export function generateDownloadToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDownloadToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function downloadTokenPrefix(rawToken: string): string {
  return rawToken.slice(0, 8);
}

export function isValidDownloadTokenShape(candidate: string): boolean {
  return TOKEN_SHAPE_REGEX.test(candidate);
}
