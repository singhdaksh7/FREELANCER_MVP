# Cloud Storage Setup — INLAY Demo Deployment

The demo deployment reuses the existing S3-compatible storage abstraction
(`src/storage/`) unchanged — see FILE_STORAGE_ARCHITECTURE.md for the full
model. This document covers only what's specific to standing up a real,
private, S3-compatible bucket for the demo (any provider works: AWS S3,
Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO, etc., as long as
it speaks the S3 API).

## 1. Bucket requirements

- **Private** — no public-read bucket policy, no public-object ACLs. The
  app only ever accesses objects through short-lived presigned URLs it
  generates itself (see `src/storage/s3-storage-provider.ts`).
- One bucket is enough. Four prefixes separate concerns inside it
  (`src/storage/storage-keys.ts`):
  - `temp/` — pre-verification client uploads
  - `originals/` — verified original files (server-written only)
  - `previews/` — watermarked preview renditions (server-written only)
  - `deliveries/` — private ZIP delivery bundles (configurable via
    `DELIVERY_BUNDLE_PREFIX`)
- Keys are opaque, 192-bit random strings — never derived from a database
  id, never guessable, never exposed as a directly-browsable path.

## 2. Environment variables

Set these directly in the Render dashboard (never commit real values):

| Variable | Purpose |
|---|---|
| `STORAGE_PROVIDER` | Always `s3` for this app. |
| `S3_ENDPOINT` | The provider's S3-API endpoint. Leave **unset** for real AWS S3 (the SDK derives it from the region); set explicitly for R2/B2/Spaces/MinIO. |
| `S3_REGION` | AWS region, or any placeholder region string non-AWS providers require (e.g. `auto` for R2). |
| `S3_BUCKET` | The bucket name. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credentials for a principal scoped to only this bucket (least privilege — see below). |
| `S3_FORCE_PATH_STYLE` | `"true"` for path-style endpoints (MinIO, many non-AWS providers); `"false"`/unset for AWS S3's virtual-hosted style. |

`src/storage/storage-config.ts` refuses to boot under `NODE_ENV=production`
if the endpoint or credentials still look like the local MinIO dev
defaults (`localhost`, `127.0.0.1`, `minio`, or the literal
`project_vault_dev` marker) — a real provider's endpoint/credentials pass
through this guard without any special-casing for `APP_ENV=demo`.

## 3. Least-privilege IAM (AWS S3 example)

Scope the demo credentials to only this bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_DEMO_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR_DEMO_BUCKET"
    }
  ]
}
```

## 4. Required browser-upload CORS policy

The creator dashboard uploads directly from the browser to storage via a
presigned `PUT` URL (`src/storage/s3-storage-provider.ts`'s
`createPresignedUploadUrl`) — the browser never proxies file bytes through
the Next.js server. That means the bucket's CORS policy must explicitly
allow both the **local dev origin** and the **final Render domain**:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://YOUR-SERVICE-NAME.onrender.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Notes:

- Update `AllowedOrigins` to your actual Render service URL once it's
  assigned (Render domains aren't known until the service is first
  created) — see RENDER_DEMO_RUNBOOK.md.
- `PUT` is required for the direct upload; `GET`/`HEAD` are required for
  the browser to load presigned preview/original/delivery-bundle download
  URLs directly.
- `AllowedHeaders: ["Content-Type"]` is sufficient — the presigned PUT URL
  is signed for a specific `Content-Type`, so no other custom headers are
  sent by the browser.
- Never add a wildcard `AllowedOrigins: ["*"]` — this bucket is private
  and only this app's two known origins should ever be allowed to
  initiate direct uploads/downloads against it.

## 5. What does NOT change for the demo

- Presigned direct uploads and presigned protected downloads work exactly
  as they do today — no code change, only configuration.
- Storage keys, prefixes, and the private-bucket/no-public-URL invariant
  are unchanged.
- Credentials remain server-only (`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`
  are never `NEXT_PUBLIC_`, never sent to the browser).
