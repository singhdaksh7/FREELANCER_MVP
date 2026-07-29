const UNSAFE_CHARS = /[^a-zA-Z0-9 ._-]/g;
const REPEATED_UNDERSCORES = /_{2,}/g;
const DEFAULT_MAX_LENGTH = 180;

/**
 * Sanitizes a creator-supplied filename for safe display and storage as
 * `WorkspaceFile.displayName`. This is a **display** value only — it is
 * never used to derive a storage key (see src/storage/storage-keys.ts),
 * so even a maximally hostile filename can't influence where an object
 * is actually written.
 */
export function sanitizeDisplayFileName(rawName: string, maxLength = DEFAULT_MAX_LENGTH): string {
  const trimmed = rawName.trim();
  const base = trimmed.length > 0 ? trimmed : "file";

  // Defends against a caller sending a path ("../../etc/passwd") as the
  // "filename" — only the last path segment is ever kept.
  const lastSegment = base.split(/[/\\]/).pop() ?? base;

  const sanitized = lastSegment.replace(UNSAFE_CHARS, "_").replace(REPEATED_UNDERSCORES, "_").trim();
  const safe = sanitized.length > 0 ? sanitized : "file";
  return safe.slice(0, maxLength);
}

/** Extracts a short, filesystem-safe extension hint (letters/digits only, no leading dot) for use in a generated storage key. Never trusted as the source of truth for file type — see src/lib/file-kind.ts. */
export function extensionHintFromFileName(rawName: string): string | undefined {
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(rawName.trim());
  return match?.[1]?.toLowerCase();
}

/**
 * Builds a safe `Content-Disposition: attachment` header value — an ASCII
 * fallback (`filename=`, non-ASCII stripped) plus an RFC 5987-encoded
 * `filename*=` for full Unicode support. Never interpolates a raw,
 * unsanitized filename — callers should already have passed the name
 * through sanitizeDisplayFileName. Phase 7 — see
 * SECURE_DOWNLOAD_ARCHITECTURE.md "Original authorization."
 */
export function buildContentDisposition(filename: string): string {
  const safe = sanitizeDisplayFileName(filename);
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
