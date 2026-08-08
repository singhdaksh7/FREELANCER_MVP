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

/**
 * Reads the first set env var from `names` (checked in order) as a
 * positive integer, falling back to `fallback` if none are set. Accepting
 * multiple names lets a newer, demo-facing var name (e.g.
 * MAX_FILE_SIZE_BYTES) take precedence over this project's original name
 * (UPLOAD_MAX_FILE_SIZE_BYTES) without breaking existing deployments that
 * already set the original.
 */
function intEnv(names: string | string[], fallback: number): number {
  for (const name of Array.isArray(names) ? names : [names]) {
    const raw = process.env[name];
    if (!raw) continue;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Invalid value for ${name}: "${raw}" (expected a positive integer)`);
    }
    return parsed;
  }
  return fallback;
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
    maxFileSizeBytes: intEnv(["MAX_FILE_SIZE_BYTES", "UPLOAD_MAX_FILE_SIZE_BYTES"], 50 * 1024 * 1024),
    maxFilesPerWorkspace: intEnv(["MAX_WORKSPACE_FILES", "UPLOAD_MAX_FILES_PER_WORKSPACE"], 50),
    maxTotalWorkspaceBytes: intEnv(
      ["MAX_WORKSPACE_STORAGE_BYTES", "UPLOAD_MAX_TOTAL_WORKSPACE_BYTES"],
      500 * 1024 * 1024,
    ),
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
    maxInputDimensionPx: intEnv(["MAX_IMAGE_DIMENSION", "PREVIEW_MAX_INPUT_DIMENSION_PX"], 8000),
    maxOutputDimensionPx: intEnv(["PREVIEW_MAX_DIMENSION", "PREVIEW_MAX_OUTPUT_DIMENSION_PX"], 1600),
    processingTimeoutMs: intEnv("PREVIEW_PROCESSING_TIMEOUT_MS", 30_000),
    quality: intEnv("PREVIEW_QUALITY", 80),
  };
}

export interface PdfPreviewLimits {
  /** Refuses to even attempt a render past this page count — bounds parse/metadata cost on a pathological multi-thousand-page PDF, even though only page 1 is ever rendered. */
  maxPageCount: number;
  /** Rendered raster is capped so neither dimension exceeds this, regardless of the PDF's declared page size — bounds canvas memory. */
  maxOutputDimensionPx: number;
  renderTimeoutMs: number;
}

export function getPdfPreviewLimits(): PdfPreviewLimits {
  return {
    maxPageCount: intEnv("PDF_PREVIEW_MAX_PAGE_COUNT", 2000),
    maxOutputDimensionPx: intEnv("PDF_PREVIEW_MAX_OUTPUT_DIMENSION_PX", 1600),
    renderTimeoutMs: intEnv("PDF_PREVIEW_RENDER_TIMEOUT_MS", 20_000),
  };
}

export interface WorkerConfig {
  pollIntervalMs: number;
  maxAttempts: number;
  /**
   * Number of parallel job-claim loops the file worker runs in-process.
   * Default 1 preserves the exact original sequential behavior — jobs are
   * still claimed one at a time with `FOR UPDATE SKIP LOCKED`, so raising
   * this is safe, it just lets one worker process handle more than one
   * job concurrently. Demo deployments keep this at 1 (conservative).
   */
  concurrency: number;
  /**
   * A job claimed (status flipped to PROCESSING) longer than this ago,
   * with no completion, is presumed abandoned by a crashed/restarted
   * worker process and is reaped (marked FAILED, surfacing the normal
   * Retry Processing action) rather than blocking that file in
   * "Processing" forever. Generous enough to comfortably cover a large
   * phone photo or multi-page PDF under load — see job-processor.ts's
   * reapStaleProcessingJobs.
   */
  processingLeaseMs: number;
}

export function getWorkerConfig(): WorkerConfig {
  return {
    // POST /wake normally interrupts this wait.  1s is the warm-worker
    // fallback when that request is unavailable or lost, without creating
    // a high-frequency database polling load.
    pollIntervalMs: intEnv("FILE_WORKER_POLL_INTERVAL_MS", 1000),
    maxAttempts: intEnv("FILE_WORKER_MAX_ATTEMPTS", 3),
    concurrency: intEnv("FILE_WORKER_CONCURRENCY", 1),
    processingLeaseMs: intEnv("FILE_WORKER_PROCESSING_LEASE_MS", 5 * 60_000),
  };
}

/**
 * Sharp (libvips) worker-thread pool size. Unset by default, which leaves
 * Sharp's own CPU-count-based default untouched — only meaningful to set
 * explicitly in resource-constrained environments (e.g. the demo's shared
 * Render instance), via SHARP_CONCURRENCY.
 */
export function getSharpConcurrency(): number | null {
  const raw = process.env.SHARP_CONCURRENCY;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for SHARP_CONCURRENCY: "${raw}" (expected a positive integer)`);
  }
  return parsed;
}

export interface ReviewLinkConfig {
  /**
   * Phase 7.5 — master review links are project-duration by default (no
   * fixed TTL; see DELIVERY_MODES.md "Master review link behaviour"), not
   * "permanent": the creator can revoke/regenerate at any time, and a
   * completed project's link becomes read-only. Set
   * REVIEW_LINK_EXPIRY_DAYS to a positive number to opt back into a fixed
   * expiry instead.
   */
  expiryDays: number | null;
  /**
   * How long a completed project's history (comments, versions, activity)
   * is retained and shown through its now-read-only master link before an
   * operator-run cleanup would be expected to remove it. Informational
   * only in this phase — no automated deletion job runs yet.
   */
  retentionDays: number;
}

/** Phase 6/7.5 — see REVIEW_TOKEN_SECURITY.md and DELIVERY_MODES.md. */
export function getReviewLinkConfig(): ReviewLinkConfig {
  const rawExpiryDays = intEnv("REVIEW_LINK_EXPIRY_DAYS", 0);
  return {
    expiryDays: rawExpiryDays > 0 ? rawExpiryDays : null,
    retentionDays: intEnv("REVIEW_LINK_RETENTION_DAYS", 180),
  };
}

export interface DownloadGrantConfig {
  /** Seconds until an issued DownloadGrant expires. */
  ttlSeconds: number;
  maxDownloads: number;
}

/** Phase 7 — see SECURE_DOWNLOAD_ARCHITECTURE.md. */
export function getDownloadGrantConfig(): DownloadGrantConfig {
  return {
    ttlSeconds: intEnv(["DOWNLOAD_GRANT_TTL_SECONDS", "DOWNLOAD_GRANT_TTL"], 60 * 60 * 24 * 14),
    maxDownloads: intEnv("DOWNLOAD_GRANT_MAX_DOWNLOADS", 20),
  };
}

export interface DeliveryWorkerConfig {
  maxAttempts: number;
  bundlePrefix: string;
  pollIntervalMs: number;
  /** Same conservative-default rationale as WorkerConfig.concurrency above. */
  concurrency: number;
  /** Demo-tier cap on total delivery-bundle (ZIP) size — see MAX_DELIVERY_BUNDLE_BYTES. */
  maxBundleBytes: number;
}

/** Phase 7 — see SECURE_DOWNLOAD_ARCHITECTURE.md "ZIP worker." */
export function getDeliveryWorkerConfig(): DeliveryWorkerConfig {
  return {
    maxAttempts: intEnv("DELIVERY_WORKER_MAX_ATTEMPTS", 3),
    bundlePrefix: process.env.DELIVERY_BUNDLE_PREFIX || "deliveries",
    pollIntervalMs: intEnv("FILE_WORKER_POLL_INTERVAL_MS", 2000),
    concurrency: intEnv("DELIVERY_WORKER_CONCURRENCY", 1),
    maxBundleBytes: intEnv("MAX_DELIVERY_BUNDLE_BYTES", 500 * 1024 * 1024),
  };
}
