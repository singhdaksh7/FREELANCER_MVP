import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { renderPdfFirstPage, UnsupportedPdfError } from "./pdf-preview";

async function makePdf(pageCount: number, size: [number, number] = [600, 800]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage(size);
    page.drawText(`Page ${i + 1}`, { x: 50, y: size[1] - 100, size: 30, font, color: rgb(0, 0, 0) });
    page.drawRectangle({ x: 50, y: 300, width: 200, height: 100, color: rgb(0.8, 0.2, 0.2) });
  }
  return Buffer.from(await doc.save());
}

describe("renderPdfFirstPage", () => {
  it("rasterizes only page 1 of a multi-page PDF, reporting the true page count", async () => {
    const pdf = await makePdf(3);
    const result = await renderPdfFirstPage(pdf);
    expect(result.pageCount).toBe(3);
    expect(result.buffer.length).toBeGreaterThan(0);

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe("png");
  });

  it("produces a non-blank raster (real page content, not an empty canvas)", async () => {
    const pdf = await makePdf(1);
    const result = await renderPdfFirstPage(pdf);
    const stats = await sharp(result.buffer).stats();
    const hasVariation = stats.channels.some((c) => c.max - c.min > 10);
    expect(hasVariation).toBe(true);
  });

  it("bounds output dimensions regardless of the PDF's declared page size", async () => {
    const pdf = await makePdf(1, [4000, 6000]);
    const result = await renderPdfFirstPage(pdf);
    expect(result.width).toBeLessThanOrEqual(1600);
    expect(result.height).toBeLessThanOrEqual(1600);
  });

  it("rejects malformed/non-PDF data", async () => {
    const garbage = Buffer.from("this is not a PDF", "utf-8");
    await expect(renderPdfFirstPage(garbage)).rejects.toBeInstanceOf(UnsupportedPdfError);
  });
});
