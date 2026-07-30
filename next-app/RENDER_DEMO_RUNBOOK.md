# Render Demo Deployment Runbook

Step-by-step instructions for standing up the INLAY demo on Render. See
DEMO_DEPLOYMENT.md for the architecture, NEON_SETUP.md for the database,
and CLOUD_STORAGE_SETUP.md for object storage.

## 1. Prerequisites

- A Neon Postgres project/branch dedicated to the demo (NEON_SETUP.md).
- An S3-compatible bucket dedicated to the demo, private, with CORS
  configured (CLOUD_STORAGE_SETUP.md).
- A Razorpay account in **Test Mode** with API keys and a webhook secret.
- This repository pushed to a Git provider Render can access (GitHub/GitLab).

## 2. Create the Render service

Option A — Blueprint (recommended): in the Render dashboard, "New" →
"Blueprint", point it at this repo. Render reads `next-app/render.yaml`
and creates the web service with the non-secret env vars pre-filled.

Option B — manual: "New" → "Web Service", point it at this repo, and set:

- **Runtime**: Node
- **Root Directory**: `next-app`
- **Build Command**: `npm ci && npm run db:generate && npm run build`
- **Start Command**: `npm run start:render-demo`
- **Health Check Path**: `/api/health`
- **Plan**: Free

## 3. Set environment variables

In the service's "Environment" tab, set every variable listed in
`.env.demo.example`. In particular, the secrets `render.yaml` deliberately
leaves blank:

- `AUTH_URL` — set this **after** the first deploy, once Render assigns
  the service's `*.onrender.com` URL (e.g. `https://inlay-demo.onrender.com`).
- `AUTH_SECRET` — generate with `openssl rand -base64 32`.
- `DATABASE_URL`, `DIRECT_URL` — from Neon's dashboard (NEON_SETUP.md).
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY` — from your S3-compatible provider
  (CLOUD_STORAGE_SETUP.md).
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET` — from Razorpay's Test Mode dashboard.

Leave `RUN_DEMO_SEED=false` for the very first deploy (migrations need to
run first), then see step 5.

## 4. First deploy

Trigger the deploy. `start:render-demo` will:

1. Run `prisma migrate deploy` against `DIRECT_URL` (or `DATABASE_URL` if
   `DIRECT_URL` isn't set).
2. Skip the demo seed (since `RUN_DEMO_SEED=false`).
3. Start the combined supervisor (web + both workers).

Confirm `https://<your-service>.onrender.com/api/health` returns `200`
with `"status":"ok"`.

## 5. Seed demo data

Once migrations have succeeded at least once:

1. In the Render dashboard, set `RUN_DEMO_SEED=true`.
2. Trigger a redeploy (or use "Manual Deploy" → "Clear build cache &
   deploy" if you want a clean build too).
3. Confirm the deploy logs show the demo seed's success line
   (`✓ Demo seed complete — ...`).
4. Optionally set `RUN_DEMO_SEED=false` again afterward — the seed is
   idempotent, so leaving it `true` on every future deploy is also safe
   and simply re-converges to the same dataset each time.

## 6. Configure Razorpay webhook

In the Razorpay Test Mode dashboard, add a webhook pointed at:

```
https://<your-service>.onrender.com/api/webhooks/razorpay
```

Use the same secret as `RAZORPAY_WEBHOOK_SECRET`. Subscribe to at least
the `payment.captured` and `payment.failed` events.

## 7. Configure storage CORS

Update the bucket's CORS policy's `AllowedOrigins` to include the actual
`https://<your-service>.onrender.com` URL now that it's known — see
CLOUD_STORAGE_SETUP.md section 4.

## 8. Verify the full flow

Walk through FOUNDER_DEMO_CHECKLIST.md end-to-end using the seeded
freelancer account (`freelancer@inlay-demo.app` / `InlayDemo@2026`).

## 9. Redeploys

Every subsequent push to the deployed branch triggers Render to re-run
the build and start commands automatically — migrations re-apply
(no-ops if nothing changed) and the optional seed re-converges safely.

## 10. Rolling back

Use Render's "Rollback" to a previous successful deploy if a bad deploy
ships. Since `prisma migrate deploy` only ever applies forward migrations,
rolling back the *code* does not automatically roll back the *schema* —
if a deploy included a migration you need to revert, that requires a
manual, deliberate follow-up migration (never `prisma migrate reset`
against Neon).
