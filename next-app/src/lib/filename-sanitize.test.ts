import { describe, expect, it } from "vitest";
import { sanitizeDisplayFileName, extensionHintFromFileName } from "./filename-sanitize";

describe("sanitizeDisplayFileName", () => {
  it("keeps a normal filename unchanged", () => {
    expect(sanitizeDisplayFileName("brand-guidelines_v2.jpg")).toBe("brand-guidelines_v2.jpg");
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeDisplayFileName("logo<script>.png")).toBe("logo_script_.png");
  });

  it("strips path components, keeping only the last segment", () => {
    expect(sanitizeDisplayFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeDisplayFileName("C:\\Users\\evil\\payload.exe")).toBe("payload.exe");
  });

  it("collapses repeated underscores", () => {
    expect(sanitizeDisplayFileName("a***b")).toBe("a_b");
  });

  it("falls back to 'file' for an empty or whitespace-only name", () => {
    expect(sanitizeDisplayFileName("   ")).toBe("file");
    expect(sanitizeDisplayFileName("")).toBe("file");
  });

  it("truncates to the maximum length", () => {
    const long = "a".repeat(300) + ".jpg";
    expect(sanitizeDisplayFileName(long, 50).length).toBe(50);
  });
});

describe("extensionHintFromFileName", () => {
  it("extracts a short extension", () => {
    expect(extensionHintFromFileName("photo.JPG")).toBe("jpg");
  });

  it("returns undefined when there's no extension", () => {
    expect(extensionHintFromFileName("no-extension")).toBeUndefined();
  });

  it("ignores an implausibly long 'extension'", () => {
    expect(extensionHintFromFileName("file.notarealextension")).toBeUndefined();
  });
});
