// No "server-only" import — must also run from the standalone worker
// (src/worker/process-files.ts). See storage-config.ts's comment.
import sharp from "sharp";
import { getPreviewLimits, getSharpConcurrency } from "@/storage/storage-config";
import { buildWatermarkLines, buildWatermarkSvg, type WatermarkTextInput } from "./watermark";
import { renderPdfFirstPage } from "./pdf-preview";

// Only overrides Sharp's own CPU-count-based default when SHARP_CONCURRENCY
// is explicitly set (e.g. on a resource-constrained demo instance).
const configuredConcurrency = getSharpConcurrency();
if (configuredConcurrency !== null) {
  sharp.concurrency(configuredConcurrency);
  // Same resource-constrained-instance gate as concurrency above — Sharp's
  // in-memory operation cache is unbounded by default, which is wasted
  // headroom on a 512MB demo instance that only ever processes one file at
  // a time anyway.
  sharp.cache(false);
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

  // `metadata()` always reports the *raw*, pre-rotation sensor dimensions
  // and the original EXIF orientation tag — it never reflects the queued
  // `.rotate()` above, since that hasn't run yet. EXIF orientations 5-8
  // mean a 90°/270° auto-rotation, which swaps width/height once the
  // pipeline actually executes. Sizing the resize target and the
  // watermark SVG from the raw (unswapped) dimensions works for
  // orientations 1-4 but, for 5-8, produces a resize target with the
  // wrong aspect ratio — Sharp's own aspect-preserving `fit: "inside"`
  // then yields an actual output smaller than the watermark SVG in one
  // dimension, and `.composite()` throws "Image to composite must have
  // same dimensions or smaller." A rotated phone photo (a common,
  // everyday case — not degenerate input) must not fail here.
  const isSidewaysOrientation = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
  const naturalWidth = isSidewaysOrientation ? metadata.height : metadata.width;
  const naturalHeight = isSidewaysOrientation ? metadata.width : metadata.height;

  if (naturalWidth > limits.maxInputDimensionPx || naturalHeight > limits.maxInputDimensionPx) {
    throw new ImageTooLargeError(
      `Image dimensions (${naturalWidth}x${naturalHeight}) exceed the ${limits.maxInputDimensionPx}px limit.`,
    );
  }

  const scale = Math.min(1, limits.maxOutputDimensionPx / Math.max(naturalWidth, naturalHeight));
  const outputWidth = Math.max(1, Math.round(naturalWidth * scale));
  const outputHeight = Math.max(1, Math.round(naturalHeight * scale));

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

export interface GeneratedPdfPreview extends GeneratedPreview {
  pageCount: number;
}

/**
 * PDF equivalent of `generateWatermarkedPreview`: rasterizes page 1 only
 * (see pdf-preview.ts — the original PDF is never touched), then runs the
 * resulting page image through the exact same resize/watermark/re-encode/
 * metadata-stripping pipeline a photo gets, with an extra "PDF Preview —
 * Page N" line baked into the tiled watermark so the output is never
 * mistaken for the original document.
 */
export async function generatePdfWatermarkedPreview(
  originalPdfBuffer: Buffer,
  watermarkInput: WatermarkTextInput,
): Promise<GeneratedPdfPreview> {
  const page = await renderPdfFirstPage(originalPdfBuffer);
  const preview = await generateWatermarkedPreview(page.buffer, {
    ...watermarkInput,
    sourceLabel: `PDF Preview — Page 1 of ${page.pageCount}`,
  });
  return { ...preview, pageCount: page.pageCount };
}
