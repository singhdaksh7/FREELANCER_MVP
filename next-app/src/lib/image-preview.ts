// No "server-only" import — must also run from the standalone worker
// (src/worker/process-files.ts). See storage-config.ts's comment.
import sharp from "sharp";
import { getPreviewLimits, getSharpConcurrency } from "@/storage/storage-config";
import { buildWatermarkLines, buildWatermarkSvg, type WatermarkTextInput } from "./watermark";

// Only overrides Sharp's own CPU-count-based default when SHARP_CONCURRENCY
// is explicitly set (e.g. on a resource-constrained demo instance).
const configuredConcurrency = getSharpConcurrency();
if (configuredConcurrency !== null) {
  sharp.concurrency(configuredConcurrency);
}

export class UnsupportedImageError extends Error {
  constructor(message = "This image could not be decoded.") {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

export class ImageTooLargeError extends Error {
  constructor(message = "This image exceeds the maximum supported dimensions.") {
    super(message);
    this.name = "ImageTooLargeError";
  }
}

export interface GeneratedPreview {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
}

/**
 * Decodes `originalBuffer`, rejects anything malformed or oversized
 * (decompression-bomb defense — the pixel-dimension check runs before any
 * full decode/resize), then produces a smaller, watermarked, metadata-free
 * JPEG. The original buffer itself is never mutated or re-uploaded —
 * callers store this returned buffer as a separate preview object.
 */
export async function generateWatermarkedPreview(
  originalBuffer: Buffer,
  watermarkInput: WatermarkTextInput,
): Promise<GeneratedPreview> {
  const limits = getPreviewLimits();

  // .rotate() with no arguments auto-orients using the EXIF orientation
  // tag, then — because withMetadata() is never called below — every
  // other metadata field (EXIF, GPS, ICC, XMP) is stripped from the
  // output by Sharp's own default behavior. This is the "correct
  // orientation safely" + "avoid carrying EXIF/GPS metadata into
  // previews" requirement in one step.
  const image = sharp(originalBuffer, { failOn: "error" }).rotate();

  let metadata: sharp.Metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw new UnsupportedImageError();
  }

  if (!metadata.width || !metadata.height) {
    throw new UnsupportedImageError("Image has no readable dimensions.");
  }
  if (metadata.width > limits.maxInputDimensionPx || metadata.height > limits.maxInputDimensionPx) {
    throw new ImageTooLargeError(
      `Image dimensions (${metadata.width}x${metadata.height}) exceed the ${limits.maxInputDimensionPx}px limit.`,
    );
  }

  const scale = Math.min(1, limits.maxOutputDimensionPx / Math.max(metadata.width, metadata.height));
  const outputWidth = Math.max(1, Math.round(metadata.width * scale));
  const outputHeight = Math.max(1, Math.round(metadata.height * scale));

  const watermarkSvg = buildWatermarkSvg(outputWidth, outputHeight, buildWatermarkLines(watermarkInput));

  try {
    const buffer = await image
      .resize(outputWidth, outputHeight, { fit: "inside" })
      .composite([{ input: Buffer.from(watermarkSvg), top: 0, left: 0 }])
      .jpeg({ quality: limits.quality, mozjpeg: true })
      .timeout({ seconds: Math.max(1, Math.ceil(limits.processingTimeoutMs / 1000)) })
      .toBuffer();

    return { buffer, width: outputWidth, height: outputHeight, mimeType: "image/jpeg" };
  } catch {
    throw new UnsupportedImageError("Image could not be processed into a preview.");
  }
}
