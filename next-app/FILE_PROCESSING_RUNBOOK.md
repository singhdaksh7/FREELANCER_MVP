# FILE_PROCESSING_RUNBOOK.md

Hands-on operations guide for Phase 5's object storage and file-processing worker. See `FILE_STORAGE_ARCHITECTURE.md` for the design reasoning behind everything here, and `DATABASE_SETUP.md` for the database-only equivalent of this document.

## What you need running, locally, all at once

Four things, for the app to fully work (upload → process → preview):

1. **PostgreSQL** (`docker compose up -d postgres`)
2. **MinIO** (`docker compose up -d minio minio-init`) — local S3-compatible storage
3. **Next.js** (`npm run dev`)
4. **The file-processing worker** (`npm run worker:files`) — a separate, long-lived process; uploads will sit at `PROCESSING` forever without it

## 1. Local MinIO startup

```bash
docker compose up -d minio minio-init
```

- `minio` — the actual S3-compatible server. Host ports: `9000` (S3 API), `9090` (web console, `minio_dev` / `project_vault_dev_password` — see `docker-compose.yml`).
- `minio-init` — a one-shot `mc` container that creates the bucket and confirms it's private, then exits. Safe to re-run (`mc mb --ignore-existing`).

Check it's healthy:

```bash
docker compose ps
# project-vault-minio should read "Up ... (healthy)"
```

Browse the bucket visually at `http://localhost:9090` (login with the credentials above) — useful for confirming an object actually landed in `originals/`/`previews/`/`temp/` during debugging.

## 2. Bucket initialization (already covered by `minio-init`, but if you need to redo it manually)

```bash
docker exec project-vault-minio-init mc alias set local http://minio:9000 project_vault_dev project_vault_dev_password
docker exec project-vault-minio-init mc mb --ignore-existing local/project-vault-files
docker exec project-vault-minio-init mc anonymous set none local/project-vault-files
```

The last command is the one that matters for security — it confirms the bucket has **no** anonymous/public read policy. If you ever see `mc anonymous set download` or similar applied to this bucket, that's a misconfiguration to fix immediately, not a feature.

## 3. Worker startup

```bash
npm run worker:files
```

Runs `src/worker/process-files.ts` via `tsx`, as a **persistent, long-lived process** — it polls for `PENDING` jobs every `FILE_WORKER_POLL_INTERVAL_MS` (default 2000ms) and keeps running until you stop it (Ctrl+C / `SIGINT`/`SIGTERM`, both handled for a clean shutdown after the in-flight job finishes).

For a one-shot run (processes at most one pending job, then exits — used by integration tests and useful for manual debugging):

```bash
npm run worker:files:once
```

**The worker is not a Next.js route, not a Vercel Function, and does not run inside `next dev`/`next start`.** It's a separate Node process by design — see `FILE_STORAGE_ARCHITECTURE.md` and the Phase 5 brief's explicit instruction not to process large binaries inside normal page rendering, and not to claim Vercel page functions are the production worker architecture.

## 4. Retry procedure

Two distinct kinds of "retry," don't confuse them:

- **Creator-initiated retry** (the "Retry Processing" button on a `FAILED` file, or `retryFileProcessingAction` / `retryFileProcessing` directly): creates a **new** `FileProcessingJob` row with an incremented `attempts` count, sets the file back to `PROCESSING`. The next time the worker polls, it'll pick this job up like any other `PENDING` job. Blocked once `attempts` reaches `FILE_WORKER_MAX_ATTEMPTS` (default 3) — the UI shows "Retry limit reached" instead of the button.
- **The worker itself does not auto-retry.** Each claimed job is attempted exactly once; on failure it's marked `FAILED` immediately (see "Failed-job investigation" below) rather than silently requeuing itself. This keeps the attempt-count/retry-limit logic in exactly one place (`src/data-access/files.ts`), not duplicated between the worker and the creator-facing action.

To manually force a retry from the command line (e.g., while debugging), it's simplest to just click "Retry Processing" in the UI — there's no separate CLI retry command, since the retry path is identical whether triggered by a click or (in principle) any other caller of `retryFileProcessing()`.

## 5. Failed-job investigation

1. **Check the file's `processingError`** — the UI already shows this (the `FileCard`'s red text under a `Failed` status), and it's always a *safe*, pre-summarized message (`src/worker/job-processor.ts`'s `summarizeError()`) — never a raw Sharp/AWS SDK stack trace.
2. **Check the worker's own stdout/stderr** — every failure is `console.error`'d with the real underlying error (`[worker] Job <id> (file <id>) failed: ...`), including the actual exception, for local debugging. This detail deliberately never reaches the browser.
3. **Check `FileProcessingJob.errorCode`/`errorMessage` in the database** (`npm run db:studio`) — `errorCode` is a short machine-readable tag (`IMAGE_TOO_LARGE`, `UNSUPPORTED_IMAGE`, `PROCESSING_FAILED`) if you want to query/aggregate failures by category.
4. **Common causes:**
   - `IMAGE_TOO_LARGE` — the image's pixel dimensions exceed `PREVIEW_MAX_INPUT_DIMENSION_PX` (default 8000px on either axis). Expected behavior, not a bug — see `FILE_STORAGE_ARCHITECTURE.md`'s decompression-bomb defense.
   - `UNSUPPORTED_IMAGE` — Sharp couldn't decode the file at all (corrupt/truncated upload, or a file that passed magic-byte sniffing at upload time but isn't a genuinely valid image).
   - `PROCESSING_FAILED` (generic) — anything else: storage temporarily unreachable mid-processing (`getObjectBuffer`/`putObjectBuffer` failure), a Sharp timeout, etc. Check the worker's console output for the real cause.
5. **"Worker unavailable" from the creator's point of view** looks like: files stuck at `PROCESSING` indefinitely, with no `FAILED` transition ever happening. This means the worker process itself isn't running — see "Worker startup" above. There's no automatic detection/alerting for this in the current phase; it's a manual "is `npm run worker:files` actually running" check.

## 6. Storage cleanup

- **Deleting a file** (via the UI, `deleteFileAction`) already removes its storage objects — see `FILE_STORAGE_ARCHITECTURE.md` "Deletion behavior." A failed storage deletion is logged but doesn't block anything; if you suspect an orphaned object, check the worker/app console output around the time of that deletion for a "Failed to delete a storage object" message.
- **Orphaned `temp/` objects**: a browser that uploads to a presigned URL but never calls the completion endpoint (closed tab, network failure) leaves an object in `temp/` and its `UploadSession` stuck at `PENDING` until `expiresAt` passes (after which `completeUploadSession` would mark it `EXPIRED` *if* someone ever tried to complete it — but nothing proactively sweeps expired sessions or their orphaned `temp/` objects in this phase). For local development, the simplest cleanup is emptying the `temp/` prefix via the MinIO console (`http://localhost:9090`) or `mc rm --recursive local/project-vault-files/temp/`. A scheduled sweep (e.g., a cron deleting `temp/` objects older than the session expiry) is recommended before any production deployment — not implemented here.
- **Reseeding the database** (`npm run db:seed`) deletes and recreates each demo creator's `Workspace` rows, which cascades to `WorkspaceFile`/`FileVersion`/`FileProcessingJob` — but **does not** touch MinIO. Reseeding leaves behind orphaned storage objects for whatever files existed before the reseed. This is a known, accepted gap for local development (storage objects are cheap and MinIO is disposable — see the reset warning below); it would need addressing before this same seed script could ever run against a shared/production-like storage bucket.

## 7. Development reset warning

**`npm run db:reset` (⚠️ destructive, guarded to local databases only — see `DATABASE_SETUP.md`) does not clear MinIO.** After a reset + reseed, old file objects (if any existed) remain in the bucket, orphaned, with nothing in Postgres pointing at them. This is harmless for local development but means:

- Don't assume "the database is fresh" implies "the storage bucket is empty."
- If you need a *fully* clean slate (e.g., testing bucket-provisioning from scratch), also stop and remove the MinIO volume:

  ```bash
  docker compose down minio
  docker volume rm next-app_project-vault-minio-data
  docker compose up -d minio minio-init
  ```

  This is destructive to **all** locally-stored file objects (dev and test alike, since they share one bucket — see "Storage-key rules" in `FILE_STORAGE_ARCHITECTURE.md` for why that's safe: every key is independently random, so dev/test data never collides even sharing one bucket).

## 8. Production worker deployment (recommendation, not implemented here)

This repository does not include production deployment configuration — the following is guidance for whoever deploys this application, not something already wired up.

- **Run the worker as its own long-lived process/service**, separate from the web application's deployment (e.g., a dedicated container, a background worker service on your platform of choice, a systemd service on a VM — anything that keeps a Node process alive continuously). It is **not** compatible with a request/response serverless function model (Vercel Functions, AWS Lambda-behind-API-Gateway, etc.) as written, because it holds a persistent polling loop rather than responding to individual invocations.
- If a serverless-friendly architecture is required, the natural adaptation is to replace the polling loop with a **queue-triggered** invocation (e.g., the completion endpoint publishes a job to SQS/a Postgres `LISTEN/NOTIFY` channel/similar, and a serverless function processes one message per invocation) — `src/worker/job-processor.ts`'s `claimNextJob`/`processJob` functions are already factored to accept a Prisma client as a parameter specifically so they can be reused from a different entry point than `process-files.ts`'s polling loop, if that adaptation is made later.
- **Horizontal scaling is safe as-is**: the `FOR UPDATE SKIP LOCKED` claim query means you can run multiple worker instances/replicas concurrently without any additional coordination — see `FILE_STORAGE_ARCHITECTURE.md` and `src/data-access/files.integration.test.ts`'s concurrent-claim test.
- **Real AWS S3 in production**: leave `S3_ENDPOINT` unset (the AWS SDK resolves the endpoint from `S3_REGION` automatically), set `S3_FORCE_PATH_STYLE=false`, and use real IAM credentials scoped to only the one bucket this app needs (`s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:CopyObject`, `s3:HeadObject` — no `s3:ListBucket`/`s3:*` beyond what's needed). `src/storage/storage-config.ts`'s production guard will refuse to boot if it detects MinIO-shaped endpoint/credential values while `NODE_ENV=production`, specifically to catch a `.env` that was copied from local development and never updated.

## 9. Phase 6 — version-upload jobs

A "new version" upload (via a workspace file's "Upload New Version" control) creates a `FileProcessingJob` exactly like an original upload — the worker's polling loop, claim query, and retry mechanics are all unchanged. The only difference is **which fields get updated on completion**:

- The worker (`src/worker/job-processor.ts`) checks whether the job's `FileVersion` is the file's `pendingVersionId` (a version-upload job) or its `currentVersionId` (the original v1 path).
- **Version-upload success**: `WorkspaceFile.currentVersionId` is atomically repointed to the newly-ready version and `pendingVersionId` is cleared, in the same transaction as the job's `COMPLETED` update. `WorkspaceFile.status` itself is not touched (it was already `READY` from the previous version).
- **Version-upload failure**: only the candidate `FileVersion.status` becomes `FAILED` — `WorkspaceFile.currentVersionId`/`status` are left exactly as they were. From the creator's point of view, the previously-working version keeps working; the Files tab shows the failed candidate separately (see `FileCard`'s "Version X candidate: FAILED" line).

Nothing here requires running a second worker process or a different command — `npm run worker:files` (or `worker:files:once` for a single job, useful for integration tests) handles both original-upload and version-upload jobs identically, distinguished only by the `pendingVersionId` check above.
