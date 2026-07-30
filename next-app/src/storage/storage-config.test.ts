import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "STORAGE_PROVIDER",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "NODE_ENV",
  "UPLOAD_MAX_FILE_SIZE_BYTES",
  "UPLOAD_MAX_FILES_PER_WORKSPACE",
  "UPLOAD_MAX_TOTAL_WORKSPACE_BYTES",
  "UPLOAD_SESSION_EXPIRY_SECONDS",
  "E2E_LOCAL_BUILD",
  "REVIEW_LINK_EXPIRY_DAYS",
  "REVIEW_LINK_RETENTION_DAYS",
  "MAX_FILE_SIZE_BYTES",
  "MAX_WORKSPACE_FILES",
  "MAX_WORKSPACE_STORAGE_BYTES",
  "MAX_IMAGE_DIMENSION",
  "PREVIEW_MAX_DIMENSION",
  "DOWNLOAD_GRANT_TTL_SECONDS",
  "DOWNLOAD_GRANT_TTL",
  "FILE_WORKER_CONCURRENCY",
  "DELIVERY_WORKER_CONCURRENCY",
  "SHARP_CONCURRENCY",
  "MAX_DELIVERY_BUNDLE_BYTES",
];

const originalEnv: Record<string, string | undefined> = {};

/** @types/node marks `process.env.NODE_ENV` read-only; this test deliberately needs to flip it per-case. */
function setNodeEnv(value: string): void {
  (process.env as Record<string, string>).NODE_ENV = value;
}

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function setDevMinioEnv() {
  process.env.S3_ENDPOINT = "http://localhost:9000";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_BUCKET = "project-vault-files";
  process.env.S3_ACCESS_KEY_ID = "project_vault_dev";
  process.env.S3_SECRET_ACCESS_KEY = "project_vault_dev_password";
  process.env.S3_FORCE_PATH_STYLE = "true";
}

describe("getStorageConfig", () => {
  it("throws if a required variable (S3_BUCKET) is missing", async () => {
    setNodeEnv("test");
    delete process.env.S3_BUCKET;
    process.env.S3_ACCESS_KEY_ID = "x";
    process.env.S3_SECRET_ACCESS_KEY = "x";
    const { getStorageConfig } = await import("./storage-config");
    expect(() => getStorageConfig()).toThrow(/S3_BUCKET/);
  });

  it("reads a valid local MinIO configuration outside production", async () => {
    setNodeEnv("development");
    setDevMinioEnv();
    const { getStorageConfig } = await import("./storage-config");
    const config = getStorageConfig();
    expect(config.bucket).toBe("project-vault-files");
    expect(config.forcePathStyle).toBe(true);
  });

  it("refuses to boot with MinIO-shaped dev defaults when NODE_ENV=production", async () => {
    setNodeEnv("production");
    setDevMinioEnv();
    const { getStorageConfig } = await import("./storage-config");
    expect(() => getStorageConfig()).toThrow(/development/i);
  });

  it("refuses to boot with the dev credential marker in production even if the endpoint looks real", async () => {
    setNodeEnv("production");
    process.env.S3_ENDPOINT = "";
    process.env.S3_BUCKET = "prod-bucket";
    process.env.S3_ACCESS_KEY_ID = "project_vault_dev";
    process.env.S3_SECRET_ACCESS_KEY = "project_vault_dev_password";
    const { getStorageConfig } = await import("./storage-config");
    expect(() => getStorageConfig()).toThrow();
  });

  it("allows local MinIO defaults under NODE_ENV=production only with the explicit E2E_LOCAL_BUILD escape hatch", async () => {
    setNodeEnv("production");
    setDevMinioEnv();
    process.env.E2E_LOCAL_BUILD = "true";
    const { getStorageConfig } = await import("./storage-config");
    expect(() => getStorageConfig()).not.toThrow();
  });

  it("allows a real-looking production configuration", async () => {
    setNodeEnv("production");
    process.env.S3_ENDPOINT = "";
    process.env.S3_REGION = "ap-south-1";
    process.env.S3_BUCKET = "prod-bucket";
    process.env.S3_ACCESS_KEY_ID = "AKIAREALKEYEXAMPLE";
    process.env.S3_SECRET_ACCESS_KEY = "realSecretValueNotDevLooking1234567890";
    const { getStorageConfig } = await import("./storage-config");
    expect(() => getStorageConfig()).not.toThrow();
  });
});

describe("getUploadLimits", () => {
  it("falls back to documented defaults when env vars are unset", async () => {
    delete process.env.UPLOAD_MAX_FILE_SIZE_BYTES;
    delete process.env.UPLOAD_MAX_FILES_PER_WORKSPACE;
    delete process.env.UPLOAD_MAX_TOTAL_WORKSPACE_BYTES;
    delete process.env.UPLOAD_SESSION_EXPIRY_SECONDS;
    const { getUploadLimits } = await import("./storage-config");
    const limits = getUploadLimits();
    expect(limits.maxFileSizeBytes).toBe(50 * 1024 * 1024);
    expect(limits.maxFilesPerWorkspace).toBe(50);
    expect(limits.maxTotalWorkspaceBytes).toBe(500 * 1024 * 1024);
    expect(limits.sessionExpirySeconds).toBe(900);
  });

  it("respects an explicit override", async () => {
    process.env.UPLOAD_MAX_FILE_SIZE_BYTES = "1048576";
    const { getUploadLimits } = await import("./storage-config");
    expect(getUploadLimits().maxFileSizeBytes).toBe(1048576);
  });

  it("rejects a non-numeric override rather than silently ignoring it", async () => {
    process.env.UPLOAD_MAX_FILE_SIZE_BYTES = "not-a-number";
    const { getUploadLimits } = await import("./storage-config");
    expect(() => getUploadLimits()).toThrow();
  });

  it("prefers the demo-facing var name (MAX_FILE_SIZE_BYTES) over the original when both are set", async () => {
    process.env.MAX_FILE_SIZE_BYTES = "10485760";
    process.env.UPLOAD_MAX_FILE_SIZE_BYTES = "999999999";
    const { getUploadLimits } = await import("./storage-config");
    expect(getUploadLimits().maxFileSizeBytes).toBe(10485760);
  });

  it("falls back to UPLOAD_MAX_FILE_SIZE_BYTES when MAX_FILE_SIZE_BYTES is unset", async () => {
    delete process.env.MAX_FILE_SIZE_BYTES;
    process.env.UPLOAD_MAX_FILE_SIZE_BYTES = "2048";
    const { getUploadLimits } = await import("./storage-config");
    expect(getUploadLimits().maxFileSizeBytes).toBe(2048);
  });

  it("supports MAX_WORKSPACE_FILES and MAX_WORKSPACE_STORAGE_BYTES aliases", async () => {
    process.env.MAX_WORKSPACE_FILES = "5";
    process.env.MAX_WORKSPACE_STORAGE_BYTES = "41943040";
    const { getUploadLimits } = await import("./storage-config");
    const limits = getUploadLimits();
    expect(limits.maxFilesPerWorkspace).toBe(5);
    expect(limits.maxTotalWorkspaceBytes).toBe(41943040);
  });
});

describe("getPreviewLimits", () => {
  it("supports MAX_IMAGE_DIMENSION and PREVIEW_MAX_DIMENSION aliases", async () => {
    process.env.MAX_IMAGE_DIMENSION = "4000";
    process.env.PREVIEW_MAX_DIMENSION = "1600";
    const { getPreviewLimits } = await import("./storage-config");
    const limits = getPreviewLimits();
    expect(limits.maxInputDimensionPx).toBe(4000);
    expect(limits.maxOutputDimensionPx).toBe(1600);
  });
});

describe("getWorkerConfig", () => {
  it("defaults concurrency to 1 (original sequential behavior)", async () => {
    delete process.env.FILE_WORKER_CONCURRENCY;
    const { getWorkerConfig } = await import("./storage-config");
    expect(getWorkerConfig().concurrency).toBe(1);
  });

  it("respects FILE_WORKER_CONCURRENCY", async () => {
    process.env.FILE_WORKER_CONCURRENCY = "3";
    const { getWorkerConfig } = await import("./storage-config");
    expect(getWorkerConfig().concurrency).toBe(3);
  });
});

describe("getDeliveryWorkerConfig", () => {
  it("defaults concurrency to 1 and maxBundleBytes to 500MB", async () => {
    delete process.env.DELIVERY_WORKER_CONCURRENCY;
    delete process.env.MAX_DELIVERY_BUNDLE_BYTES;
    const { getDeliveryWorkerConfig } = await import("./storage-config");
    const config = getDeliveryWorkerConfig();
    expect(config.concurrency).toBe(1);
    expect(config.maxBundleBytes).toBe(500 * 1024 * 1024);
  });

  it("respects MAX_DELIVERY_BUNDLE_BYTES and DELIVERY_WORKER_CONCURRENCY overrides", async () => {
    process.env.MAX_DELIVERY_BUNDLE_BYTES = "41943040";
    process.env.DELIVERY_WORKER_CONCURRENCY = "2";
    const { getDeliveryWorkerConfig } = await import("./storage-config");
    const config = getDeliveryWorkerConfig();
    expect(config.maxBundleBytes).toBe(41943040);
    expect(config.concurrency).toBe(2);
  });
});

describe("getSharpConcurrency", () => {
  it("returns null when SHARP_CONCURRENCY is unset, preserving Sharp's own default", async () => {
    delete process.env.SHARP_CONCURRENCY;
    const { getSharpConcurrency } = await import("./storage-config");
    expect(getSharpConcurrency()).toBeNull();
  });

  it("returns the configured value when set", async () => {
    process.env.SHARP_CONCURRENCY = "1";
    const { getSharpConcurrency } = await import("./storage-config");
    expect(getSharpConcurrency()).toBe(1);
  });
});

describe("getDownloadGrantConfig", () => {
  it("supports the DOWNLOAD_GRANT_TTL_SECONDS alias", async () => {
    process.env.DOWNLOAD_GRANT_TTL_SECONDS = "604800";
    const { getDownloadGrantConfig } = await import("./storage-config");
    expect(getDownloadGrantConfig().ttlSeconds).toBe(604800);
  });
});

describe("getReviewLinkConfig", () => {
  it("defaults to a project-duration link (expiryDays null) — Phase 7.5 master-link behaviour", async () => {
    delete process.env.REVIEW_LINK_EXPIRY_DAYS;
    const { getReviewLinkConfig } = await import("./storage-config");
    expect(getReviewLinkConfig().expiryDays).toBeNull();
  });

  it("defaults retentionDays to 180", async () => {
    delete process.env.REVIEW_LINK_RETENTION_DAYS;
    const { getReviewLinkConfig } = await import("./storage-config");
    expect(getReviewLinkConfig().retentionDays).toBe(180);
  });

  it("opts into a fixed expiry when REVIEW_LINK_EXPIRY_DAYS is a positive number", async () => {
    process.env.REVIEW_LINK_EXPIRY_DAYS = "30";
    const { getReviewLinkConfig } = await import("./storage-config");
    expect(getReviewLinkConfig().expiryDays).toBe(30);
  });

  it("respects an explicit retention override", async () => {
    process.env.REVIEW_LINK_RETENTION_DAYS = "365";
    const { getReviewLinkConfig } = await import("./storage-config");
    expect(getReviewLinkConfig().retentionDays).toBe(365);
  });
});
