import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { generateWatermarkedPreview, UnsupportedImageError, ImageTooLargeError } from "./image-preview";

const WATERMARK_INPUT = { clientName: "Rohit Sharma", clientEmail: "rohit@example.com", workspaceTitle: "Brand Identity" };

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
