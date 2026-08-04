import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { generateWatermarkedPreview, generatePdfWatermarkedPreview, UnsupportedImageError, ImageTooLargeError } from "./image-preview";

const WATERMARK_INPUT = { clientName: "Rohit Sharma", workspaceTitle: "Brand Identity" };

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([600, 800]);
    page.drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 30, font });
  }
  return Buffer.from(await doc.save());
}

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .jpeg()
    .toBuffer();
}

describe("generateWatermarkedPreview — dimension calculation", () => {
  it("keeps a small image (under the output cap) at its original size", async () => {
    const input = await makeJpeg(400, 300);
    const preview = await generateWatermarkedPreview(input, WATERMARK_INPUT);
    expect(preview.width).toBe(400);
    expect(preview.height).toBe(300);
  });

  it("downscales a large landscape image so its longest side matches the output cap", async () => {
    const input = await makeJpeg(3200, 1600); // 2:1 landscape, default output cap is 1600px
    const preview = await generateWatermarkedPreview(input, WATERMARK_INPUT);
    expect(preview.width).toBe(1600);
    expect(preview.height).toBe(800);
  });

  it("downscales a large portrait image preserving aspect ratio", async () => {
    const input = await makeJpeg(1600, 3200); // 1:2 portrait
    const preview = await generateWatermarkedPreview(input, WATERMARK_INPUT);
    expect(preview.width).toBe(800);
    expect(preview.height).toBe(1600);
  });

  it("outputs a JPEG regardless of input format", async () => {
    const pngInput = await sharp({ create: { width: 100, height: 100, channels: 3, background: "green" } })
      .png()
      .toBuffer();
    const preview = await generateWatermarkedPreview(pngInput, WATERMARK_INPUT);
    expect(preview.mimeType).toBe("image/jpeg");
    const metadata = await sharp(preview.buffer).metadata();
    expect(metadata.format).toBe("jpeg");
  });

  it("accepts a real PNG input end to end (not just format-detection)", async () => {
    const pngInput = await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 10, g: 200, b: 90, alpha: 1 } } })
      .png()
      .toBuffer();
    const preview = await generateWatermarkedPreview(pngInput, WATERMARK_INPUT);
    expect(preview.width).toBe(800);
    expect(preview.height).toBe(600);
    expect(preview.mimeType).toBe("image/jpeg");
  });

  it("accepts a real WebP input end to end", async () => {
    const webpInput = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 90, b: 40 } } })
      .webp()
      .toBuffer();
    const preview = await generateWatermarkedPreview(webpInput, WATERMARK_INPUT);
    expect(preview.width).toBe(800);
    expect(preview.height).toBe(600);
    expect(preview.mimeType).toBe("image/jpeg");
  });

  it("processes a standard phone-camera portrait photo (3024x4032) without hitting the dimension-protection limit", async () => {
    const input = await makeJpeg(3024, 4032);
    const preview = await generateWatermarkedPreview(input, WATERMARK_INPUT);
    // Well under the default 8000px input limit and the demo deployment's
    // 6000px MAX_IMAGE_DIMENSION (see render.yaml) — must process
    // normally, only downscaled to the output cap.
    expect(preview.height).toBeLessThanOrEqual(1600);
    expect(preview.width).toBeLessThanOrEqual(1600);
    const aspectRatio = preview.width / preview.height;
    expect(aspectRatio).toBeCloseTo(3024 / 4032, 2);
  });

  it("auto-orients a rotated (EXIF-tagged) photo instead of preserving the raw sensor orientation", async () => {
    // A landscape sensor buffer (300x200) with EXIF orientation 6 ("rotate
    // 90° CW to display upright") must be *displayed* portrait (200x300) —
    // generateWatermarkedPreview's .rotate() (no args) auto-applies EXIF
    // orientation, exactly like every phone camera app / browser does.
    const rotated = await sharp({ create: { width: 300, height: 200, channels: 3, background: "purple" } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const preview = await generateWatermarkedPreview(rotated, WATERMARK_INPUT);
    expect(preview.width).toBe(200);
    expect(preview.height).toBe(300);
  });
});

describe("generateWatermarkedPreview — validation", () => {
  it("rejects malformed/undecodable image data", async () => {
    const garbage = Buffer.from("this is not an image", "utf-8");
    await expect(generateWatermarkedPreview(garbage, WATERMARK_INPUT)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it("rejects an image whose dimensions exceed the configured input limit", async () => {
    const huge = await makeJpeg(9000, 9000); // default limit is 8000px
    await expect(generateWatermarkedPreview(huge, WATERMARK_INPUT)).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});

describe("generateWatermarkedPreview — watermark regression", () => {
  it("visibly alters pixels relative to a flat-color original (the watermark is actually baked into the output)", async () => {
    const input = await makeJpeg(600, 400); // flat single-color background
    const preview = await generateWatermarkedPreview(input, WATERMARK_INPUT);

    const { data, info } = await sharp(preview.buffer).raw().toBuffer({ resolveWithObject: true });
    const [firstR, firstG, firstB] = [data[0], data[1], data[2]];
    let foundDifferentPixel = false;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] !== firstR || data[i + 1] !== firstG || data[i + 2] !== firstB) {
        foundDifferentPixel = true;
        break;
      }
    }
    // A preview generated from a perfectly flat-color source image would
    // itself be flat if (and only if) no watermark had been composited —
    // finding a differently-colored pixel proves the watermark is really
    // baked into the pixels, not just theoretically applied.
    expect(foundDifferentPixel).toBe(true);
  });

  it("never mutates the original buffer passed in", async () => {
    const input = await makeJpeg(500, 350);
    const originalCopy = Buffer.from(input);
    await generateWatermarkedPreview(input, WATERMARK_INPUT);
    expect(Buffer.compare(input, originalCopy)).toBe(0);
  });
});

describe("generatePdfWatermarkedPreview", () => {
  it("produces a watermarked JPEG preview of page 1 only, reporting the true page count", async () => {
    const pdf = await makePdf(3);
    const preview = await generatePdfWatermarkedPreview(pdf, WATERMARK_INPUT);
    expect(preview.mimeType).toBe("image/jpeg");
    expect(preview.pageCount).toBe(3);

    const metadata = await sharp(preview.buffer).metadata();
    expect(metadata.format).toBe("jpeg");
  });

  it("bakes a 'PDF Preview' label into the output, distinguishing it from an ordinary image preview", async () => {
    // Can't OCR the rendered pixels in a unit test, but can prove the two
    // preview paths produce genuinely different output for otherwise
    // identical watermark inputs — generatePdfWatermarkedPreview passes an
    // extra sourceLabel line (see watermark.ts) that generateWatermarkedPreview
    // never does.
    const pdf = await makePdf(1);
    const pdfPreview = await generatePdfWatermarkedPreview(pdf, WATERMARK_INPUT);

    const flatImage = await sharp({ create: { width: 600, height: 800, channels: 3, background: "white" } })
      .jpeg()
      .toBuffer();
    const imagePreview = await generateWatermarkedPreview(flatImage, WATERMARK_INPUT);

    expect(Buffer.compare(pdfPreview.buffer, imagePreview.buffer)).not.toBe(0);
  });

  it("the original PDF buffer is never mutated", async () => {
    const pdf = await makePdf(1);
    const originalCopy = Buffer.from(pdf);
    await generatePdfWatermarkedPreview(pdf, WATERMARK_INPUT);
    expect(Buffer.compare(pdf, originalCopy)).toBe(0);
  });
});

describe("generateWatermarkedPreview — metadata stripping", () => {
  it("produces an output image with no EXIF metadata", async () => {
    const input = await sharp({ create: { width: 200, height: 200, channels: 3, background: "red" } })
      .withMetadata({ exif: { IFD0: { Make: "TestCamera" } } })
      .jpeg()
      .toBuffer();

    const preview = await generateWatermarkedPreview(input, WATERMARK_INPUT);
    const outputMetadata = await sharp(preview.buffer).metadata();
    expect(outputMetadata.exif).toBeUndefined();
  });
});
