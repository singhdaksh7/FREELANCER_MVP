import { describe, expect, it } from "vitest";
import { bigIntToDisplayNumber, numberToStorageBigInt, formatBytes } from "./bytes";

describe("bigIntToDisplayNumber", () => {
  it("converts a normal file-size BigInt to a number", () => {
    expect(bigIntToDisplayNumber(BigInt(52428800))).toBe(52428800);
  });

  it("throws rather than silently losing precision beyond MAX_SAFE_INTEGER", () => {
    expect(() => bigIntToDisplayNumber(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1))).toThrow();
  });

  it("throws for a negative value", () => {
    expect(() => bigIntToDisplayNumber(BigInt(-1))).toThrow();
  });
});

describe("numberToStorageBigInt", () => {
  it("round-trips a plain byte count", () => {
    expect(numberToStorageBigInt(1024)).toBe(BigInt(1024));
  });

  it("truncates a non-integer value rather than throwing", () => {
    expect(numberToStorageBigInt(1024.9)).toBe(BigInt(1024));
  });

  it("throws for a negative value", () => {
    expect(() => numberToStorageBigInt(-5)).toThrow();
  });
});

describe("formatBytes", () => {
  it("formats bytes, KB, MB, and GB with the expected units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(4_200_000)).toBe("4.0 MB");
    expect(formatBytes(52_428_800)).toBe("50.0 MB");
  });
});
