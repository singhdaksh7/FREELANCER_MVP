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
});
