// Imports from the browser-safe, dependency-free enums entrypoint (never
// `.../client`) so this module stays usable from the worker script,
// route handlers, and (for the upload dropzone's client-side pre-check)
// Client Components alike.
import { FileKind } from "@/generated/prisma/enums";

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

export function mimeTypeToFileKind(mimeType: string): FileKind {
  if (IMAGE_MIME_TYPES.has(mimeType)) return FileKind.IMAGE;
  if (PDF_MIME_TYPES.has(mimeType)) return FileKind.PDF;
  if (ARCHIVE_MIME_TYPES.has(mimeType)) return FileKind.ARCHIVE;
  return FileKind.OTHER;
}

/** Only IMAGE files get a generated visual preview in this phase — PDF/ZIP are "locked deliverables," see the Files-tab UI. */
export function isPreviewableFileKind(kind: FileKind): boolean {
  return kind === FileKind.IMAGE;
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
