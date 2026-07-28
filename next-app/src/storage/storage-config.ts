// NOTE: deliberately does NOT `import "server-only"`. Every other
// server-side module in this app does — but this one (and the rest of
// src/storage/*) must also run from the standalone file-processing worker
// (src/worker/process-files.ts, started via `npm run worker:files`),
// which runs as a plain Node script outside Next.js's bundler and would
// crash immediately on any "server-only" import (see prisma/seed.ts for
// the same, pre-existing constraint on the Prisma client). Never import
// this module from a Client Component — nothing here is bundler-enforced,
// only convention-enforced.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${name}: "${raw}" (expected a positive integer)`);
  }
  return parsed;
}

export interface StorageConfig {
  provider: string;
  endpoint: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * Substrings that only ever appear in this project's own local MinIO
 * defaults (docker-compose.yml, .env.example) — never a real production
 * value by construction, since they're literal strings from a committed
 * file. A production boot with any of these present means a `.env` (or
 * deployment config) was copied over without being replaced.
 */
const DEV_ENDPOINT_MARKERS = ["localhost", "127.0.0.1", "minio"];
const DEV_CREDENTIAL_MARKERS = ["project_vault_dev"];

function assertNotDevConfigInProduction(config: StorageConfig): void {
  if (process.env.NODE_ENV !== "production") return;
  // Narrow, explicit escape hatch for running a *local* production build
  // (`next build && next start`) against local MinIO — used only by
  // playwright.config.ts's e2e webServer, so visual/E2E tests don't need
  // a real S3 bucket. This variable is never set in any real deployment;
  // if it's ever seen outside a local test run, that's a configuration
  // mistake to fix, not a reason to weaken this guard further.
  if (process.env.E2E_LOCAL_BUILD === "true") return;

  const endpointLooksDev = DEV_ENDPOINT_MARKERS.some((marker) =>
    config.endpoint?.toLowerCase().includes(marker),
  );
  const credentialLooksDev = DEV_CREDENTIAL_MARKERS.some(
    (marker) => config.accessKeyId.includes(marker) || config.secretAccessKey.includes(marker),
  );

  if (endpointLooksDev || credentialLooksDev) {
    throw new Error(
      "Refusing to start: object-storage configuration still points at local development " +
        "defaults (MinIO endpoint and/or dev credentials) while NODE_ENV=production. " +
        "Set real S3_ENDPOINT (or unset it for AWS S3) and real S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY.",
    );
  }
}

let cachedConfig: StorageConfig | null = null;

/** Reads and validates object-storage configuration once, caching the result for the process lifetime. */
export function getStorageConfig(): StorageConfig {
  if (cachedConfig) return cachedConfig;

  const config: StorageConfig = {
    provider: process.env.STORAGE_PROVIDER ?? "s3",
    // Left unset entirely for real AWS S3 — the SDK resolves the
    // endpoint from `region` instead. Only local MinIO needs this set.
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: requireEnv("S3_BUCKET"),
    accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };

  assertNotDevConfigInProduction(config);
  cachedConfig = config;
  return config;
}

export interface UploadLimits {
  maxFileSizeBytes: number;
  maxFilesPerWorkspace: number;
  maxTotalWorkspaceBytes: number;
  sessionExpirySeconds: number;
}

export function getUploadLimits(): UploadLimits {
  return {
    maxFileSizeBytes: intEnv("UPLOAD_MAX_FILE_SIZE_BYTES", 50 * 1024 * 1024),
    maxFilesPerWorkspace: intEnv("UPLOAD_MAX_FILES_PER_WORKSPACE", 50),
    maxTotalWorkspaceBytes: intEnv("UPLOAD_MAX_TOTAL_WORKSPACE_BYTES", 500 * 1024 * 1024),
    sessionExpirySeconds: intEnv("UPLOAD_SESSION_EXPIRY_SECONDS", 900),
  };
}

export interface PreviewLimits {
  maxInputDimensionPx: number;
  maxOutputDimensionPx: number;
  processingTimeoutMs: number;
  quality: number;
}

export function getPreviewLimits(): PreviewLimits {
  return {
    maxInputDimensionPx: intEnv("PREVIEW_MAX_INPUT_DIMENSION_PX", 8000),
    maxOutputDimensionPx: intEnv("PREVIEW_MAX_OUTPUT_DIMENSION_PX", 1600),
    processingTimeoutMs: intEnv("PREVIEW_PROCESSING_TIMEOUT_MS", 30_000),
    quality: intEnv("PREVIEW_QUALITY", 80),
  };
}

export interface WorkerConfig {
  pollIntervalMs: number;
  maxAttempts: number;
}

export function getWorkerConfig(): WorkerConfig {
  return {
    pollIntervalMs: intEnv("FILE_WORKER_POLL_INTERVAL_MS", 2000),
    maxAttempts: intEnv("FILE_WORKER_MAX_ATTEMPTS", 3),
  };
}

export interface ReviewLinkConfig {
  expiryDays: number;
}

/** Phase 6 — see REVIEW_TOKEN_SECURITY.md. */
export function getReviewLinkConfig(): ReviewLinkConfig {
  return {
    expiryDays: intEnv("REVIEW_LINK_EXPIRY_DAYS", 30),
  };
}
