import { s3StorageProvider } from "./s3-storage-provider";
import { getUploadLimits } from "./storage-config";
import type { PresignedUpload } from "./storage-provider";

/**
 * Short-lived preview-access URLs — never long-lived, per
 * FILE_STORAGE_ARCHITECTURE.md "Presigned URL rules." 60 seconds is long
 * enough for a browser to load one `<img>` request, not long enough to be
 * meaningfully shareable after the page that requested it closes.
 */
const PREVIEW_URL_EXPIRY_SECONDS = 60;

/** Presigned PUT URL for a single temp/ key, valid only for `UPLOAD_SESSION_EXPIRY_SECONDS`. */
export async function createUploadPresignedUrl(key: string, contentType: string): Promise<PresignedUpload> {
  const { sessionExpirySeconds } = getUploadLimits();
  return s3StorageProvider.createPresignedUploadUrl({ key, contentType, expiresInSeconds: sessionExpirySeconds });
}

/** Short-lived, read-only preview URL — the only way a preview object is ever accessed from the browser. */
export async function createPreviewPresignedUrl(previewStorageKey: string): Promise<string> {
  return s3StorageProvider.createPresignedDownloadUrl(previewStorageKey, PREVIEW_URL_EXPIRY_SECONDS);
}
