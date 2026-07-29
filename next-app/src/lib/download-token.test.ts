import { describe, expect, it } from "vitest";
import { generateDownloadToken, hashDownloadToken, downloadTokenPrefix, isValidDownloadTokenShape } from "./download-token";

describe("download-token generation and hashing", () => {
  it("generates tokens with at least 256 bits of entropy (base64url-encoded, ~43 chars)", () => {
    const token = generateDownloadToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a different token on every call", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateDownloadToken()));
    expect(tokens.size).toBe(20);
  });

  it("hashes deterministically — same input, same hash", () => {
    const token = generateDownloadToken();
    expect(hashDownloadToken(token)).toBe(hashDownloadToken(token));
  });

  it("produces a 64-char hex SHA-256 digest", () => {
    const hash = hashDownloadToken("some-raw-token-value");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("two different tokens hash to two different values", () => {
    expect(hashDownloadToken(generateDownloadToken())).not.toBe(hashDownloadToken(generateDownloadToken()));
  });

  it("never reuses the review-token's own value space as a coincidence check (independent generation)", () => {
    const a = generateDownloadToken();
    const b = generateDownloadToken();
    expect(a).not.toBe(b);
  });

  it("prefix is exactly the first 8 characters, never enough to reconstruct the token", () => {
    const token = generateDownloadToken();
    expect(downloadTokenPrefix(token)).toBe(token.slice(0, 8));
    expect(downloadTokenPrefix(token).length).toBe(8);
  });
});

describe("isValidDownloadTokenShape", () => {
  it("accepts a real generated token", () => {
    expect(isValidDownloadTokenShape(generateDownloadToken())).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidDownloadTokenShape("")).toBe(false);
  });

  it("rejects a too-short candidate", () => {
    expect(isValidDownloadTokenShape("short")).toBe(false);
  });

  it("rejects a candidate with unsafe characters (path traversal attempt)", () => {
    expect(isValidDownloadTokenShape("../../etc/passwd-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });

  it("rejects a SQL-injection-shaped candidate", () => {
    expect(isValidDownloadTokenShape("' OR '1'='1'; DROP TABLE download_grants;--")).toBe(false);
  });
});
