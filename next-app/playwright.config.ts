import { defineConfig, devices } from "@playwright/test";

const PORT = 4500;
const BASE_URL = `http://localhost:${PORT}`;
const AUTH_FILE = "e2e/visual/.auth/creator.json";
const ADMIN_AUTH_FILE = "e2e/visual/.auth/admin.json";

/**
 * Visual regression + authentication E2E config. Runs against a
 * production build (`next build && next start`) rather than `next dev`,
 * so there's no dev-mode overlay/HMR chrome in screenshots and output is
 * as close as possible to what ships. Requires the local Postgres
 * database to be up and seeded (`docker compose up -d`, `npm run
 * db:seed`) — the app talks to the real database, same as in
 * production, there is no mocking at this layer.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      // A couple of pixels of anti-aliasing drift is expected between
      // runs/machines; this keeps the check meaningful without being flaky.
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run build && npm run start -- -p " + PORT,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // Lowers the per-file upload limit for the whole e2e run so
      // e2e/uploads/uploads.spec.ts's "oversized file" test doesn't need
      // to actually upload 50+ MB — nothing else in the e2e suite
      // uploads a file anywhere near 2 MB, so this is safe to apply globally.
      env: {
        UPLOAD_MAX_FILE_SIZE_BYTES: "2097152",
        // Local-only escape hatch for storage-config.ts's production
        // guard — this is a real `next build && next start` (so
        // NODE_ENV=production) but talking to local MinIO on purpose.
        // Never set this anywhere outside this local test webServer.
        E2E_LOCAL_BUILD: "true",
      },
    },
    {
      // File-processing worker (Phase 5) — required for any test that
      // uploads a file and waits for it to reach READY/FAILED (see
      // e2e/uploads/*.spec.ts). Not an HTTP server, so there's no `url`
      // health check; Playwright just keeps the process running
      // alongside the Next.js server for the duration of the test run.
      // See FILE_PROCESSING_RUNBOOK.md for why this is a separate
      // process rather than something the web request cycle does itself.
      command: "npm run worker:files",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Delivery-bundle worker (Phase 6/7.5) — required for any test that
      // waits for an APPROVAL_ONLY "Release Approved Files" action or a
      // PAYMENT_REQUIRED capture to actually reach FILES_UNLOCKED/DELIVERED
      // (see e2e/requirements-alignment/approval-only.spec.ts). Same
      // "long-running process, no HTTP health check" shape as the
      // file-processing worker above.
      command: "npm run worker:deliveries",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "setup",
      testDir: "./e2e/visual",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "auth-e2e",
      testDir: "./e2e/auth",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      // Deliberately no dependency on "setup" / no shared storageState —
      // these tests are about the login/logout/redirect flow itself, so
      // each one manages its own auth state via the real UI.
    },
    {
      name: "mutations-e2e",
      testDir: "./e2e/mutations",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      // Same as auth-e2e: each spec logs in through the real UI itself
      // rather than sharing the visual suite's storageState, since these
      // tests create/mutate real records against the real dev database.
    },
    {
      name: "uploads-e2e",
      testDir: "./e2e/uploads",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      // Same reasoning as mutations-e2e — real uploads against the real
      // dev database/MinIO, kept in its own project so it can be run in
      // isolation from the visual suite (see FILE_STORAGE_ARCHITECTURE.md).
    },
    {
      name: "review-e2e",
      testDir: "./e2e/review",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      // Same reasoning as uploads-e2e — real uploads, real worker
      // processing, and a real review-token round trip against the real
      // dev database/MinIO. Uses ws_brand_identity (uploads-e2e uses
      // ws_social_campaign) so the two never contend for the same
      // workspace's file list even if run back to back — see
      // CLIENT_REVIEW_ARCHITECTURE.md.
    },
    {
      name: "payment-e2e",
      testDir: "./e2e/payment",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      // Isolated like mutations-e2e/uploads-e2e/review-e2e: each spec logs
      // in through the real UI and creates its own workspace(s), so it
      // never shares state with the visual suite or the other E2E projects.
    },
    {
      name: "requirements-alignment-e2e",
      testDir: "./e2e/requirements-alignment",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      // Same isolation reasoning — one file per concern, each creating its
      // own workspace/client/ticket via the real UI with a distinct,
      // timestamped title so parallel specs never collide. Capped workers:
      // this project has more files than mutations-e2e/uploads-e2e/review-e2e
      // (which each stay single-file, serial, to avoid contending for the
      // one shared dev server process — see mutations.spec.ts's doc
      // comment), and running all 12 files' wizard/upload/worker traffic at
      // full default parallelism against that same shared server was
      // observed to time out real workspace-creation navigations — even
      // workers: 2 still showed the same timeouts, so this is fully
      // serialized like mutations-e2e/uploads-e2e/review-e2e.
      workers: 1,
    },
    {
      name: "desktop-1440",
      testDir: "./e2e/visual",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /visual[\\/]admin[\\/]/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: AUTH_FILE },
      dependencies: ["setup"],
      // Capped: this suite now includes several new specs that each drive
      // a full wizard+upload+worker-processing cycle (delivery modes,
      // pins, annotations, version conversations), on top of the existing
      // ones. Running the whole file set at this machine's full default
      // parallelism (~half its logical cores) was observed to overload the
      // one shared dev server/Postgres/worker processes badly enough to
      // fail even pre-existing, previously-stable specs — not a data race,
      // just more concurrent heavy work than this local setup sustains.
      workers: 3,
    },
    {
      name: "tablet-768",
      testDir: "./e2e/visual",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /visual[\\/]admin[\\/]/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, storageState: AUTH_FILE },
      dependencies: ["setup"],
      workers: 3,
    },
    {
      name: "mobile-390",
      testDir: "./e2e/visual",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /visual[\\/]admin[\\/]/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, storageState: AUTH_FILE },
      dependencies: ["setup"],
      workers: 3,
    },
    {
      name: "admin-setup",
      testDir: "./e2e/visual",
      testMatch: /admin-auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "admin-desktop-1440",
      testDir: "./e2e/visual/admin",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: ADMIN_AUTH_FILE },
      dependencies: ["admin-setup"],
    },
    {
      name: "admin-tablet-768",
      testDir: "./e2e/visual/admin",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, storageState: ADMIN_AUTH_FILE },
      dependencies: ["admin-setup"],
    },
    {
      name: "admin-mobile-390",
      testDir: "./e2e/visual/admin",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, storageState: ADMIN_AUTH_FILE },
      dependencies: ["admin-setup"],
    },
  ],
});
