// Imports from the browser-safe, dependency-free enums entrypoint (never
// `.../client`) so this module stays usable from the worker script,
// route handlers, and (for the upload dropzone's client-side pre-check)
// Client Components alike.
import { FileKind } from "@/generated/prisma/enums";

// HEIC/HEIF (the default photo format on iPhones) is deliberately NOT in
// this set: this deployment's prebuilt Sharp/libvips binary bundles a
// HEIF decoder that is AVIF-only (`sharp.format.heif.input.fileSuffix`
// is `[".avif"]`, verified against the exact shipped binary) — prebuilt
// Sharp binaries never include an HEVC decoder due to patent licensing,
// so a real-world HEIC photo would be accepted here only to fail with an
// opaque error at watermark-generation time. Re-check
// `sharp.format.heif` against the deployed binary before ever adding
// "image/heic"/"image/heif" here.
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_MIME_TYPES = new Set(["application/pdf"]);
const ARCHIVE_MIME_TYPES = new Set(["application/zip", "application/x-zip-compressed"]);

/** The complete MVP-supported set — see TECHNICAL_AUDIT.md/Phase 5 brief §2. Anything else is rejected, regardless of extension. */
const ALLOWED_MIME_TYPES = new Set<string>([...IMAGE_MIME_TYPES, ...PDF_MIME_TYPES, ...ARCHIVE_MIME_TYPES]);

/**
 * Explicitly, deliberately rejected even though some of these could
 * theoretically be "unknown" rather than allow-listed — belt-and-suspenders
 * against active content types (scripts, HTML, SVG — SVG can embed
 * `<script>`) ever being accepted as an upload.
 */
const EXPLICITLY_REJECTED_MIME_TYPES = new Set<string>([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
  "application/javascript",
  "text/javascript",
  "application/x-msdos-program",
]);

export function isSupportedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType) && !EXPLICITLY_REJECTED_MIME_TYPES.has(mimeType);
}

const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

/**
 * Client-facing rejection message for a File that failed
 * isSupportedMimeType — HEIC/HEIF gets its own explicit, actionable
 * message (rather than the generic "not supported") since it's the
 * single most common real-world rejection: the default photo format on
 * iPhones. Browsers are inconsistent about reporting a HEIC file's MIME
 * type (some report "", "image/heic", or "image/heif"), so this also
 * falls back to the file extension.
 */
export function unsupportedFileMessage(file: { type: string; name: string }): string {
  const isHeic = HEIC_MIME_TYPES.has(file.type) || /\.hei[cf]$/i.test(file.name);
  if (isHeic) {
    return "This image format is not supported yet. Please upload JPEG, PNG, or WebP.";
  }
  return "This file type isn't supported.";
}

export function mimeTypeToFileKind(mimeType: string): FileKind {
  if (IMAGE_MIME_TYPES.has(mimeType)) return FileKind.IMAGE;
  if (PDF_MIME_TYPES.has(mimeType)) return FileKind.PDF;
  if (ARCHIVE_MIME_TYPES.has(mimeType)) return FileKind.ARCHIVE;
  return FileKind.OTHER;
}

/**
 * Whether this file kind is *capable* of having a generated protected
 * preview at all — this is what routes the worker's processJob() between
 * the Sharp image pipeline (IMAGE), the pdf.js page-1 rasterization
 * pipeline (PDF, see pdf-preview.ts/image-preview.ts's
 * generatePdfWatermarkedPreview), and markNonPreviewableReady (ARCHIVE/
 * OTHER, which never gets a generated preview — a ZIP has no meaningful
 * single-frame visual representation).
 *
 * This alone does NOT mean a preview currently exists for a given file —
 * every preview-serving code path additionally requires
 * `version.status === "READY" && version.previewStorageKey` (see the
 * preview-url routes and files.ts's `previewAvailable`), so a PDF whose
 * render failed or is still processing correctly shows a processing/retry
 * state, never a preview.
 */
export function isPreviewableFileKind(kind: FileKind): boolean {
  return kind === FileKind.IMAGE || kind === FileKind.PDF;
}

export function humanReadableFileKind(kind: FileKind): string {
  switch (kind) {
    case FileKind.IMAGE:
      return "Image";
    case FileKind.PDF:
      return "PDF";
    case FileKind.ARCHIVE:
      return "Archive";
    default:
      return "File";
  }
}
