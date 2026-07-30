import { describe, expect, it } from "vitest";
import { buildUniqueZipEntryNames } from "./zip-entry-name";

describe("buildUniqueZipEntryNames", () => {
  it("passes through already-safe, unique display names unchanged", () => {
    expect(buildUniqueZipEntryNames(["logo.png", "brief.pdf"])).toEqual(["logo.png", "brief.pdf"]);
  });

  it("de-duplicates a repeated display name with a numeric suffix before the extension", () => {
    expect(buildUniqueZipEntryNames(["photo.jpg", "photo.jpg", "photo.jpg"])).toEqual([
      "photo.jpg",
      "photo (1).jpg",
      "photo (2).jpg",
    ]);
  });

  it("strips path traversal attempts down to a flat filename", () => {
    const [entry] = buildUniqueZipEntryNames(["../../../etc/passwd"]);
    expect(entry).not.toContain("/");
    expect(entry).not.toContain("..");
  });

  it("strips a Windows-style absolute path down to a flat filename", () => {
    const [entry] = buildUniqueZipEntryNames(["C:\\Windows\\System32\\evil.dll"]);
    expect(entry).not.toContain("\\");
    expect(entry).not.toContain(":");
  });

  it("never produces an empty entry name even for a fully-unsafe input", () => {
    const [entry] = buildUniqueZipEntryNames(["???.exe".replace(/[a-z]/gi, "/")]);
    expect(entry.length).toBeGreaterThan(0);
  });

  it("de-duplicates two different but sanitize-to-the-same-name inputs", () => {
    const names = buildUniqueZipEntryNames(["a/b.pdf", "a\\b.pdf"]);
    expect(new Set(names).size).toBe(2);
  });
});
