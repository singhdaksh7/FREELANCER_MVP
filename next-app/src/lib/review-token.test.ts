import { describe, expect, it } from "vitest";
import { generateReviewToken, hashReviewToken, reviewTokenPrefix, isValidReviewTokenShape, hashesEqual } from "./review-token";

describe("generateReviewToken", () => {
  it("produces a base64url string with at least 256 bits of entropy", () => {
    const token = generateReviewToken();
    // base64url encodes 32 bytes (256 bits) as 43 characters (no padding).
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never produces the same token twice across many calls", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateReviewToken()));
    expect(tokens.size).toBe(500);
  });

  it("is not derived from any predictable/sequential source (no shared prefix across calls)", () => {
    const a = generateReviewToken();
    const b = generateReviewToken();
    expect(a).not.toBe(b);
    expect(a.slice(0, 8)).not.toBe(b.slice(0, 8));
  });
});

describe("hashReviewToken", () => {
  it("is deterministic for the same input", () => {
    const token = generateReviewToken();
    expect(hashReviewToken(token)).toBe(hashReviewToken(token));
  });

  it("produces a 64-char lowercase hex SHA-256 digest", () => {
    const hash = hashReviewToken("some-token-value");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different tokens", () => {
    const a = hashReviewToken(generateReviewToken());
    const b = hashReviewToken(generateReviewToken());
    expect(a).not.toBe(b);
  });

  it("never contains the raw token as a substring (redaction sanity check)", () => {
    const token = generateReviewToken();
    const hash = hashReviewToken(token);
    expect(hash).not.toContain(token);
  });
});

describe("reviewTokenPrefix", () => {
  it("returns exactly the first 8 characters", () => {
    const token = "abcdefghijklmnopqrstuvwxyz";
    expect(reviewTokenPrefix(token)).toBe("abcdefgh");
  });

  it("is not sufficient to reconstruct the full token", () => {
    const token = generateReviewToken();
    const prefix = reviewTokenPrefix(token);
    expect(prefix.length).toBeLessThan(token.length);
  });
});

describe("isValidReviewTokenShape", () => {
  it("accepts a real generated token", () => {
    expect(isValidReviewTokenShape(generateReviewToken())).toBe(true);
  });

  it("rejects tokens that are too short", () => {
    expect(isValidReviewTokenShape("short")).toBe(false);
  });

  it("rejects tokens with disallowed characters", () => {
    expect(isValidReviewTokenShape("a".repeat(43) + "!@#$")).toBe(false);
  });

  it("rejects tokens containing path-traversal-like sequences", () => {
    expect(isValidReviewTokenShape("../../etc/passwd")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidReviewTokenShape("")).toBe(false);
  });
});

describe("hashesEqual", () => {
  it("returns true for identical hex digests", () => {
    const hash = hashReviewToken("token-value");
    expect(hashesEqual(hash, hash)).toBe(true);
  });

  it("returns false for different digests", () => {
    expect(hashesEqual(hashReviewToken("a"), hashReviewToken("b"))).toBe(false);
  });

  it("returns false (not throws) for mismatched lengths", () => {
    expect(hashesEqual("ab", "abcd")).toBe(false);
  });
});
