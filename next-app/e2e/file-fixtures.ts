import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import JSZip from "jszip";

/** Minimal, structurally-valid PDF (well-known "Hello World" example) — enough for magic-byte detection and a real decode, without a heavy fixture binary checked into the repo. */
const MINIMAL_PDF = `%PDF-1.1
%\xc2\xa5\xc2\xb1\xc3\xab

1 0 obj
  << /Type /Catalog
     /Pages 2 0 R
  >>
endobj

2 0 obj
  << /Type /Pages
     /Kids [3 0 R]
     /Count 1
     /MediaBox [0 0 300 144]
  >>
endobj

3 0 obj
  <<  /Type /Page
      /Parent 2 0 R
      /Resources
       << /Font
           << /F1
               << /Type /Font
                  /Subtype /Type1
                  /BaseFont /Times-Roman
               >>
           >>
       >>
      /Contents 4 0 R
  >>
endobj

4 0 obj
  << /Length 55 >>
stream
  BT
    /F1 18 Tf
    0 0 Td
    (Hello, Vault!) Tj
  ET
endstream
endobj

xref
0 5
0000000000 65535 f
0000000018 00000 n
0000000077 00000 n
0000000178 00000 n
0000000457 00000 n
trailer
  <<  /Root 1 0 R
      /Size 5
  >>
startxref
565
%%EOF`;

export function makeFixturesDir(): string {
  return mkdtempSync(join(tmpdir(), "vault-e2e-fixtures-"));
}

export async function writeValidJpegFixture(dir: string, name: string, width = 800, height = 600): Promise<string> {
  const path = join(dir, name);
  writeFileSync(
    path,
    await sharp({ create: { width, height, channels: 3, background: { r: 40, g: 110, b: 190 } } })
      .jpeg()
      .toBuffer(),
  );
  return path;
}

/** A structurally-real JPEG whose pixel dimensions exceed the worker's input-dimension limit — reaches PROCESSING for real, then genuinely fails, no mocking needed. */
export async function writeOversizedDimensionJpegFixture(dir: string, name: string): Promise<string> {
  const path = join(dir, name);
  writeFileSync(
    path,
    await sharp({ create: { width: 8400, height: 20, channels: 3, background: "red" } })
      .jpeg()
      .toBuffer(),
  );
  return path;
}

export function writeMinimalPdfFixture(dir: string, name: string): string {
  const path = join(dir, name);
  writeFileSync(path, Buffer.from(MINIMAL_PDF, "binary"));
  return path;
}

export function writeUnsupportedFixture(dir: string, name: string): string {
  const path = join(dir, name);
  writeFileSync(path, Buffer.from("MZ this is not a real executable, just disallowed content"));
  return path;
}

/** A structurally-real ZIP archive — always ARCHIVE-classified, and (unlike PDF/IMAGE) never gets a generated visual preview, since a ZIP has no meaningful single-frame representation. */
export async function writeMinimalZipFixture(dir: string, name: string): Promise<string> {
  const zip = new JSZip();
  zip.file("readme.txt", "e2e fixture archive contents");
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const path = join(dir, name);
  writeFileSync(path, buffer);
  return path;
}
