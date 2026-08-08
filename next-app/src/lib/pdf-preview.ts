// No "server-only" import — must also run from the standalone worker
// (src/worker/process-files.ts). See storage-config.ts's comment.
//
// Rendering strategy: Sharp/libvips in this deployment's prebuilt binary
// has no PDF input support at all (`sharp.format.pdf.input` is false —
// verified against the exact binary this app ships) and its bundled HEIF
// decoder is AVIF-only (no HEVC decoder in prebuilt binaries, a well-known
// licensing constraint — see file-kind.ts), so PDFs can't go through the
// image pipeline directly. Instead: pdf.js (pure JS, no native PDF
// dependency) parses the document and rasterizes page 1 onto a
// `@napi-rs/canvas` canvas (prebuilt native binary per platform, same
// "no system libraries required" deployability as Sharp itself — unlike
// the `canvas` npm package, which needs system cairo/pango). The
// resulting PNG buffer is then handed to image-preview.ts's existing
// `generateWatermarkedPreview`, so PDF pages get the exact same
// resize/watermark/re-encode/metadata-stripping treatment a photo does.
import { createRequire } from "node:module";
import path from "node:path";
import { getPdfPreviewLimits } from "@/storage/storage-config";

export class UnsupportedPdfError extends Error {
  constructor(message = "This PDF could not be read.") {
    super(message);
    this.name = "UnsupportedPdfError";
  }
}

export class PdfTooLargeError extends Error {
  constructor(message = "This PDF has too many pages to preview.") {
    super(message);
    this.name = "PdfTooLargeError";
  }
}

export class PdfProcessingTimeoutError extends Error {
  constructor(message = "This PDF took too long to render.") {
    super(message);
    this.name = "PdfProcessingTimeoutError";
  }
}

export interface RenderedPdfPage {
  buffer: Buffer;
  width: number;
  height: number;
  pageCount: number;
}

let cachedStandardFontDataPath: string | null = null;
function standardFontDataPath(): string {
  if (cachedStandardFontDataPath) return cachedStandardFontDataPath;
  // pdfjs-dist's legacy Node build reads its bundled standard-font
  // metrics from a plain filesystem path (a file:// URL fails to resolve
  // in this environment) — resolved via the package's own package.json
  // rather than a relative path, so it's correct regardless of where
  // this module ends up in the bundled worker's directory layout.
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("pdfjs-dist/package.json");
  cachedStandardFontDataPath = path.join(path.dirname(pkgPath), "standard_fonts") + path.sep;
  return cachedStandardFontDataPath;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new PdfProcessingTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Renders only page 1 of `pdfBuffer` to a PNG buffer — never any other
 * page, and the original PDF bytes are never written anywhere by this
 * function. No embedded JavaScript is ever executed (`isEvalSupported:
 * false`), and nothing here ever resolves or exposes a URL to the
 * original file.
 */
export async function renderPdfFirstPage(pdfBuffer: Buffer): Promise<RenderedPdfPage> {
  const limits = getPdfPreviewLimits();

  // Both dependencies are deliberately lazy: normal image jobs import this
  // worker module too, but must never initialize PDF parsing or a native
  // canvas binding.
  const [pdfjsLib, { createCanvas }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("@napi-rs/canvas"),
  ]);

  let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]> | null = null;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      isEvalSupported: false,
      useSystemFonts: false,
      standardFontDataUrl: standardFontDataPath(),
    });
    pdf = await withTimeout(loadingTask.promise, limits.renderTimeoutMs);

    if (pdf.numPages < 1) {
      throw new UnsupportedPdfError("This PDF has no pages.");
    }
    if (pdf.numPages > limits.maxPageCount) {
      throw new PdfTooLargeError(`This PDF has ${pdf.numPages} pages, exceeding the ${limits.maxPageCount}-page preview limit.`);
    }

    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, limits.maxOutputDimensionPx / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale: Math.max(0.1, scale) });
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    // White background — a PDF page's own content is typically opaque,
    // but a page with transparency shouldn't render as a black/blank tile.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    // `@napi-rs/canvas`'s 2D context implements the same drawing surface
    // pdf.js needs but isn't a DOM CanvasRenderingContext2D (its TS types
    // are written against the browser's, e.g. no `drawFocusIfNeeded`) —
    // the same well-known interop cast every pdfjs-dist + non-browser-canvas
    // integration needs.
    await withTimeout(
      page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise,
      limits.renderTimeoutMs,
    );

    const buffer = canvas.toBuffer("image/png");
    return { buffer, width, height, pageCount: pdf.numPages };
  } catch (error) {
    if (error instanceof UnsupportedPdfError || error instanceof PdfTooLargeError || error instanceof PdfProcessingTimeoutError) {
      throw error;
    }
    throw new UnsupportedPdfError();
  } finally {
    await pdf?.destroy().catch(() => {});
  }
}
