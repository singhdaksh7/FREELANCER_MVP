import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sha256Hex } from "./checksum";

describe("sha256Hex", () => {
  it("matches node:crypto's own SHA-256 digest for a fixed input", () => {
    const input = Buffer.from("hello world");
    const expected = createHash("sha256").update(input).digest("hex");
    expect(sha256Hex(input)).toBe(expected);
    expect(sha256Hex(input)).toHaveLength(64);
  });

  it("is deterministic — the same bytes always produce the same digest", () => {
    const buffer = Buffer.from([1, 2, 3, 4, 5]);
    expect(sha256Hex(buffer)).toBe(sha256Hex(Buffer.from([1, 2, 3, 4, 5])));
  });

  it("produces different digests for different content (original vs. watermarked preview)", () => {
    const original = Buffer.from("original bytes");
    const preview = Buffer.from("watermarked preview bytes");
    expect(sha256Hex(original)).not.toBe(sha256Hex(preview));
  });

  it("is sensitive to every byte — a one-byte change produces a completely different digest", () => {
    const a = Buffer.from([0, 0, 0, 1]);
    const b = Buffer.from([0, 0, 0, 2]);
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
  });
});
