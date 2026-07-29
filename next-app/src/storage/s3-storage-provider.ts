// No "server-only" import — see storage-config.ts's comment for why (this
// module must also run from the standalone file-processing worker).

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageConfig } from "./storage-config";
import type { StorageProvider, ObjectMetadata, CreatePresignedUploadInput, PresignedUpload } from "./storage-provider";

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const config = getStorageConfig();
  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return cachedClient;
}

function isNotFoundError(error: unknown): boolean {
  const name = (error as { name?: string } | undefined)?.name;
  const statusCode = (error as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata
    ?.httpStatusCode;
  return name === "NotFound" || name === "NoSuchKey" || statusCode === 404;
}

/**
 * S3-compatible implementation (works against real AWS S3 or local MinIO
 * — see storage-config.ts). This is the only place in the app that
 * imports the AWS SDK directly.
 */
export const s3StorageProvider: StorageProvider = {
  async createPresignedUploadUrl({ key, contentType, expiresInSeconds }: CreatePresignedUploadInput): Promise<PresignedUpload> {
    const config = getStorageConfig();
    const command = new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
    return { url, key, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
  },

  async headObject(key: string): Promise<ObjectMetadata | null> {
    const config = getStorageConfig();
    try {
      const result = await getClient().send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
      return {
        key,
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType,
        etag: result.ETag,
      };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  },

  async getObjectBuffer(key: string): Promise<Buffer> {
    const config = getStorageConfig();
    const result = await getClient().send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error("Object body was empty");
    return Buffer.from(bytes);
  },

  async putObjectBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    const config = getStorageConfig();
    await getClient().send(
      new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  },

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    const config = getStorageConfig();
    await getClient().send(
      new CopyObjectCommand({
        Bucket: config.bucket,
        CopySource: encodeURIComponent(`${config.bucket}/${sourceKey}`),
        Key: destinationKey,
      }),
    );
  },

  async deleteObject(key: string): Promise<void> {
    const config = getStorageConfig();
    await getClient().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  },

  async createPresignedDownloadUrl(
    key: string,
    expiresInSeconds: number,
    options?: { responseContentDisposition?: string },
  ): Promise<string> {
    const config = getStorageConfig();
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ResponseContentDisposition: options?.responseContentDisposition,
    });
    return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
  },
};
