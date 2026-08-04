export interface PreviewFetchResult {
  status: "ready" | "locked" | "error";
  url?: string;
  message?: string;
  error?: string;
}

/**
 * Shared client-side fetch for a presigned protected-preview URL, used by
 * every preview-rendering surface (review portal canvas, file-rail
 * thumbnails, creator file card). Centralized so all three interpret the
 * preview-url route's response (locked/ok/error) identically.
 */
export async function fetchPreviewUrl(
  previewUrlBase: string,
  fileId: string,
  versionId?: string | null,
): Promise<PreviewFetchResult> {
  try {
    const qs = versionId ? `?versionId=${versionId}` : "";
    const res = await fetch(`${previewUrlBase}/${fileId}/preview-url${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: "error", error: data.error ?? "Preview unavailable." };
    }
    if (data.locked) {
      return { status: "locked", message: data.message ?? "Preview not available for this file type." };
    }
    if (!data.url) {
      return { status: "error", error: "Preview unavailable." };
    }
    return { status: "ready", url: data.url };
  } catch {
    return { status: "error", error: "Network error loading preview." };
  }
}
