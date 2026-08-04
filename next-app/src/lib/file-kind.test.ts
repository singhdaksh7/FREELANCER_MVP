import { describe, expect, it } from "vitest";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { isSupportedMimeType, mimeTypeToFileKind, isPreviewableFileKind, humanReadableFileKind } from "./file-kind";
import { FileKind } from "@/generated/prisma/enums";

describe("isSupportedMimeType", () => {
  it("accepts the MVP-supported image/PDF/archive types", () => {
    expect(isSupportedMimeType("image/jpeg")).toBe(true);
    expect(isSupportedMimeType("image/png")).toBe(true);
    expect(isSupportedMimeType("image/webp")).toBe(true);
    expect(isSupportedMimeType("application/pdf")).toBe(true);
    expect(isSupportedMimeType("application/zip")).toBe(true);
  });

  it("rejects active-content types even if a caller tried to allow-list them elsewhere", () => {
    expect(isSupportedMimeType("text/html")).toBe(false);
    expect(isSupportedMimeType("image/svg+xml")).toBe(false);
    expect(isSupportedMimeType("application/javascript")).toBe(false);
    expect(isSupportedMimeType("application/x-msdownload")).toBe(false);
  });

  it("rejects unknown/unlisted binary types", () => {
    expect(isSupportedMimeType("application/octet-stream")).toBe(false);
    expect(isSupportedMimeType("video/mp4")).toBe(false);
  });

  it("rejects HEIC/HEIF — this deployment's Sharp binary has no HEVC decoder (AVIF-only HEIF support), so accepting it would only fail later at watermark-generation time", () => {
    expect(isSupportedMimeType("image/heic")).toBe(false);
    expect(isSupportedMimeType("image/heif")).toBe(false);
  });
});

describe("mimeTypeToFileKind", () => {
  it("maps each supported MIME type to its FileKind", () => {
    expect(mimeTypeToFileKind("image/png")).toBe(FileKind.IMAGE);
    expect(mimeTypeToFileKind("application/pdf")).toBe(FileKind.PDF);
    expect(mimeTypeToFileKind("application/zip")).toBe(FileKind.ARCHIVE);
    expect(mimeTypeToFileKind("application/octet-stream")).toBe(FileKind.OTHER);
  });
});

describe("isPreviewableFileKind / humanReadableFileKind", () => {
  it("IMAGE and PDF are previewable — ARCHIVE/OTHER never generate a preview", () => {
    expect(isPreviewableFileKind(FileKind.IMAGE)).toBe(true);
    expect(isPreviewableFileKind(FileKind.PDF)).toBe(true);
    expect(isPreviewableFileKind(FileKind.ARCHIVE)).toBe(false);
    expect(isPreviewableFileKind(FileKind.OTHER)).toBe(false);
  });

  it("has a human label for every kind", () => {
    expect(humanReadableFileKind(FileKind.IMAGE)).toBe("Image");
    expect(humanReadableFileKind(FileKind.PDF)).toBe("PDF");
    expect(humanReadableFileKind(FileKind.ARCHIVE)).toBe("Archive");
    expect(humanReadableFileKind(FileKind.OTHER)).toBe("File");
  });
});

describe("magic-byte detection (file-type) — never trust a declared extension/MIME alone", () => {
  it("detects a real JPEG by its bytes, not its declared type", async () => {
    const buffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
      .jpeg()
      .toBuffer();
    const detected = await fileTypeFromBuffer(new Uint8Array(buffer));
    expect(detected?.mime).toBe("image/jpeg");
  });

  it("detects a real PNG by its bytes", async () => {
    const buffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: "blue" } })
      .png()
      .toBuffer();
    const detected = await fileTypeFromBuffer(new Uint8Array(buffer));
    expect(detected?.mime).toBe("image/png");
  });

  it("detects a real WebP by its bytes", async () => {
    const buffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: "green" } })
      .webp()
      .toBuffer();
    const detected = await fileTypeFromBuffer(new Uint8Array(buffer));
    expect(detected?.mime).toBe("image/webp");
  });

  it("does not detect a supported type for plain text content, even if it claims to be an image", async () => {
    const fakeImage = Buffer.from("<html><script>alert(1)</script></html>", "utf-8");
    const detected = await fileTypeFromBuffer(new Uint8Array(fakeImage));
    expect(detected?.mime ? isSupportedMimeType(detected.mime) : false).toBe(false);
  });

  it("rejects a spoofed upload: real bytes are plain text/HTML even though the filename/declared type claims to be a JPEG", async () => {
    // Simulates an attacker renaming a malicious HTML/script file to
    // "photo.jpg" and declaring Content-Type: image/jpeg — the sniffed
    // magic-byte type must win, not the filename extension or the
    // browser-declared MIME type (see uploads.ts's completeUploadSession,
    // which always sniffs before trusting anything client-supplied).
    const spoofed = Buffer.from("<script>alert('spoofed jpeg')</script>", "utf-8");
    const detected = await fileTypeFromBuffer(new Uint8Array(spoofed));
    expect(detected?.mime).not.toBe("image/jpeg");
    expect(detected?.mime ? isSupportedMimeType(detected.mime) : false).toBe(false);
  });
});
