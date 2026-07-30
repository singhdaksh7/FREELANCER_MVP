import { sanitizeDisplayFileName } from "./filename-sanitize";

/**
 * Builds safe, unique, flat ZIP entry names for the delivery-bundle
 * worker — see SECURE_DOWNLOAD_ARCHITECTURE.md "ZIP worker." Reuses the
 * same sanitizer as display filenames (strips path separators, unsafe
 * characters), so a hostile display name can never become a ZIP entry
 * that escapes the archive root (no "../", no absolute paths, no nested
 * directory traversal — every entry is a single flat filename).
 */
export function buildUniqueZipEntryNames(displayNames: string[]): string[] {
  const seen = new Map<string, number>();
  return displayNames.map((rawName) => {
    const sanitized = sanitizeDisplayFileName(rawName);
    const count = seen.get(sanitized) ?? 0;
    seen.set(sanitized, count + 1);
    if (count === 0) return sanitized;

    const dotIndex = sanitized.lastIndexOf(".");
    const base = dotIndex > 0 ? sanitized.slice(0, dotIndex) : sanitized;
    const ext = dotIndex > 0 ? sanitized.slice(dotIndex) : "";
    return `${base} (${count})${ext}`;
  });
}
