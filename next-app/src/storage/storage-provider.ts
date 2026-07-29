/**
 * Storage-provider interface — business logic (data-access, Server
 * Actions, route handlers, the worker) depends only on this shape, never
 * directly on the AWS SDK. `s3-storage-provider.ts` is the only
 * implementation today (works against both real AWS S3 and MinIO, since
 * MinIO is S3-API-compatible), but nothing outside src/storage/ knows that.
 */

export interface PresignedUpload {
  url: string;
  key: string;
  expiresAt: Date;
}

export interface ObjectMetadata {
  key: string;
  sizeBytes: number;
  contentType: string | undefined;
  etag: string | undefined;
}

export interface CreatePresignedUploadInput {
  key: string;
  contentType: string;
  expiresInSeconds: number;
}

export interface StorageProvider {
  /** Presigned PUT URL for a single, specific key — never reusable for a different key. */
  createPresignedUploadUrl(input: CreatePresignedUploadInput): Promise<PresignedUpload>;
  /** Returns `null` (never throws) when the object doesn't exist. */
  headObject(key: string): Promise<ObjectMetadata | null>;
  getObjectBuffer(key: string): Promise<Buffer>;
  putObjectBuffer(key: string, body: Buffer, contentType: string): Promise<void>;
  copyObject(sourceKey: string, destinationKey: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /** Short-lived, read-only presigned GET URL. Callers choose the expiry — never generate a long-lived one. `responseContentDisposition`, when set, signs a Content-Disposition override into the URL (see src/lib/filename-sanitize.ts's buildContentDisposition) — never trust a caller-supplied disposition beyond an already-sanitized filename. */
  createPresignedDownloadUrl(key: string, expiresInSeconds: number, options?: { responseContentDisposition?: string }): Promise<string>;
}
