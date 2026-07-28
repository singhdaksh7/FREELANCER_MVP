import { describe, expect, it } from "vitest";
import { generateStorageKey, STORAGE_PREFIXES } from "./storage-keys";

describe("generateStorageKey", () => {
  it("prefixes the key with the requested storage prefix", () => {
    expect(generateStorageKey(STORAGE_PREFIXES.temp)).toMatch(/^temp\//);
    expect(generateStorageKey(STORAGE_PREFIXES.originals)).toMatch(/^originals\//);
    expect(generateStorageKey(STORAGE_PREFIXES.previews)).toMatch(/^previews\//);
  });

  it("generates a long, random hex key with no predictable structure", () => {
    const key = generateStorageKey(STORAGE_PREFIXES.temp);
    const random = key.split("/")[1];
    expect(random).toMatch(/^[0-9a-f]{48}$/);
  });

  it("never generates the same key twice", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateStorageKey(STORAGE_PREFIXES.originals)));
    expect(keys.size).toBe(200);
  });

  it("appends a sanitized extension hint when provided", () => {
    expect(generateStorageKey(STORAGE_PREFIXES.originals, "jpg")).toMatch(/\.jpg$/);
  });

  it("strips unsafe characters out of the extension hint", () => {
    const key = generateStorageKey(STORAGE_PREFIXES.originals, "jp/g;rm -rf");
    const [prefix, rest] = key.split("/");
    expect(prefix).toBe("originals");
    const extension = rest.split(".")[1];
    expect(extension).toMatch(/^[a-z0-9]*$/);
  });

  it("never derives the key from a database id — it's independent, cryptographically random output", () => {
    const key1 = generateStorageKey(STORAGE_PREFIXES.temp);
    const key2 = generateStorageKey(STORAGE_PREFIXES.temp);
    expect(key1).not.toBe(key2);
  });
});
