import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { login } from "../mutations/helpers";
import { waitForFileStatus } from "../helpers/wait-for-file-status";

/**
 * Functional coverage of real uploads/processing/retry/delete against the
 * real dev database, real MinIO, and the real file-processing worker
 * (started by playwright.config.ts's second webServer entry). One file,
 * serial, for the same shared-dev-server-process reason documented in
 * e2e/mutations/mutations.spec.ts. Uses the seeded DRAFT workspace
 * ws_social_campaign (Arjun's) rather than creating a new one, so these
 * tests don't also depend on the Phase 4 wizard.
 *
 * The e2e Next.js server is booted with UPLOAD_MAX_FILE_SIZE_BYTES
 * overridden to 2 MB (see playwright.config.ts's webServer `env`) so the
 * "oversized file" test doesn't need to actually upload 50+ MB.
 */
test.describe.configure({ mode: "serial" });

const WORKSPACE_PATH = "/workspaces/ws_social_campaign";
const RUN_ID = Date.now();

let fixturesDir = "";
let validImagePath = "";
let oversizedDimensionImagePath = "";
let unsupportedFilePath = "";
let tooLargeFilePath = "";

test.beforeAll(async () => {
  fixturesDir = mkdtempSync(join(tmpdir(), "vault-upload-fixtures-"));

  validImagePath = join(fixturesDir, `valid-${RUN_ID}.jpg`);
  writeFileSync(
    validImagePath,
    await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 40, g: 110, b: 190 } } })
      .jpeg()
      .toBuffer(),
  );

  // A structurally-real JPEG whose pixel dimensions exceed the worker's
  // configured input-dimension limit (default 8000px) — this reaches
  // PROCESSING for real (it passes upload verification/magic-byte
  // sniffing) and then genuinely fails in the worker, no mocking needed.
  oversizedDimensionImagePath = join(fixturesDir, `oversized-dimensions-${RUN_ID}.jpg`);
  writeFileSync(
    oversizedDimensionImagePath,
    await sharp({ create: { width: 8400, height: 20, channels: 3, background: "red" } })
      .jpeg()
      .toBuffer(),
  );

  unsupportedFilePath = join(fixturesDir, `not-allowed-${RUN_ID}.exe`);
  writeFileSync(unsupportedFilePath, Buffer.from("MZ this is not a real executable, just disallowed content"));

  // Exceeds the e2e-configured 2 MB UPLOAD_MAX_FILE_SIZE_BYTES. Named
  // .jpg (not .bin) so the browser assigns it a supported `image/jpeg`
  // MIME type and the client-side pre-check actually reaches the size
  // check, rather than rejecting it earlier for an unsupported type.
  tooLargeFilePath = join(fixturesDir, `too-large-${RUN_ID}.jpg`);
  writeFileSync(tooLargeFilePath, Buffer.alloc(3 * 1024 * 1024, 7));
});

test.beforeEach(async ({ page }) => {
  page.on("console", (msg) => console.log(`BROWSER: ${msg.text()}`));
  await login(page);
});

// This is the ONE dedicated test in the suite that proves the app's own
// automatic UI polling (FilesTab's router.refresh() interval) actually
// carries a file from Processing to Ready with no manual page.reload() —
// see e2e/helpers/wait-for-file-status.ts's doc comment and Phase 6's
// reliability plan. Every other test that needs a file to reach a status
// uses that shared helper (which is allowed to fall back to reload()); this
// one deliberately never reloads, so a regression in FilesTab's own polling
// shows up here specifically rather than being masked by a reload fallback.
test("uploads a valid image and the UI's own automatic polling carries it to Ready with no manual reload", async ({ page }) => {
  // Raised alongside the inner assertion's own timeout below — the default
  // 30s test timeout (playwright.config.ts) would otherwise kill the test
  // before that wait ever gets to finish.
  test.setTimeout(120_000);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(validImagePath);

  // Upload queue shows progress, then the file card appears and
  // eventually transitions from Processing to Ready as the worker
  // (running alongside this test run) picks up the job.
  await expect(page.getByText(`valid-${RUN_ID}.jpg`)).toBeVisible();
  const card = page.locator(`[data-testid="file-card"][data-file-name="valid-${RUN_ID}.jpg"]`);
  try {
    // Generous timeout: this is the first request this suite makes against
    // the freshly-started `next start` production server (see
    // playwright.config.ts's webServer) — first-hit route compilation plus
    // the file-processing worker's own cold start can together exceed 20s
    // under load, even though the worker's own claim-to-completion time is
    // consistently well under a second once actually running (see the
    // `[file-worker]` timing logs in job-processor.ts). Later tests in this
    // file never need this much headroom because the server is warm by then.
    // No page.reload() anywhere in this test — see the doc comment above.
    await expect(card.getByTestId("file-status")).toHaveText("Ready", { timeout: 90_000 });
    await expect(card.getByRole("button", { name: /view protected preview/i })).toBeVisible();
  } catch (e) {
    console.log("DUMPING DOM:");
    const html = await page.evaluate(() => document.body.innerHTML);
    console.log(html);
    throw e;
  }
});

test("opens the protected preview", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const card = page.locator(`[data-testid="file-card"][data-file-name="valid-${RUN_ID}.jpg"]`);
  await card.getByRole("button", { name: /view protected preview/i }).click();
  await expect(card.getByRole("img", { name: new RegExp(`protected preview of valid-${RUN_ID}\\.jpg`, "i") })).toBeVisible();
});

test("never shows an original-file download action", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /download original/i })).toHaveCount(0);
});

test("a direct refresh of the workspace details page preserves the file's Ready state", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();
  await page.reload();
  await page.getByRole("tab", { name: /^files$/i }).click();

  await waitForFileStatus(page, { fileName: `valid-${RUN_ID}.jpg`, expectedStatus: "Ready", timeoutMs: 20_000 }, test.info());
});

test("rejects an unsupported file type without creating a processed file", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(unsupportedFilePath);

  await expect(page.getByText(`not-allowed-${RUN_ID}.exe`)).toBeVisible();
  await expect(page.getByText(/isn't supported/i)).toBeVisible();
});

test("rejects a file over the configured size limit", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(tooLargeFilePath);

  await expect(page.getByText(`too-large-${RUN_ID}.jpg`)).toBeVisible();
  await expect(page.getByText(/larger than the.*MB limit/i)).toBeVisible();
});

test("a file that fails processing shows the Failed state with a retry action", async ({ page }) => {
  // See the "uploads a valid image" test's comment on why this needs more
  // than the default 30s test timeout in this environment.
  test.setTimeout(120_000);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(oversizedDimensionImagePath);
  await expect(page.getByText(`oversized-dimensions-${RUN_ID}.jpg`)).toBeVisible();

  const card = page.locator(`[data-testid="file-card"][data-file-name="oversized-dimensions-${RUN_ID}.jpg"]`);
  await waitForFileStatus(page, { fileName: `oversized-dimensions-${RUN_ID}.jpg`, expectedStatus: "Failed", reselectFilesTab: true }, test.info());
  await expect(card.getByRole("button", { name: /retry processing/i })).toBeVisible();
});

test("retrying a failed file re-queues it for processing", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const card = page.locator(`[data-testid="file-card"][data-file-name="oversized-dimensions-${RUN_ID}.jpg"]`);
  await card.getByRole("button", { name: /retry processing/i }).click();

  // Still oversized, so it genuinely fails again — this asserts the retry
  // mechanism itself works (a fresh attempt happens), not that the
  // outcome changes.
  await waitForFileStatus(page, { fileName: `oversized-dimensions-${RUN_ID}.jpg`, expectedStatus: "Failed", reselectFilesTab: true }, test.info());
});

test("removes an eligible file after confirmation", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const card = page.locator(`[data-testid="file-card"][data-file-name="oversized-dimensions-${RUN_ID}.jpg"]`);
  await card.getByRole("button", { name: /^remove$/i }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`remove oversized-dimensions-${RUN_ID}\\.jpg\\?`, "i") })).toBeVisible();
  await page.getByRole("button", { name: /remove file/i }).click();

  // Scoped to the file card itself (not a bare text match): the confirm
  // dialog's own now-closed heading ("Remove <name>?") still contains this
  // filename as a substring and never leaves the DOM, so a plain text-count
  // assertion would never reliably reach 0.
  //
  // KNOWN DEFECT (Phase 6 investigation, not a test flake): the delete
  // Server Action completes correctly and quickly — the DB row is marked
  // DELETED and the action's own RSC response correctly omits this file
  // from the live file list within ~200ms (confirmed via trace inspection:
  // the deleted filename appears only in Activity-log entries, never in the
  // file list, in that response) — yet this card was observed to remain in
  // the DOM under a 60s/121-poll wait with zero sign of ever updating. The
  // same shape (a ConfirmDialog-driven mutation whose own trigger/target
  // element should disappear) also affects "Cancel Workspace" under a tight
  // timeout, but that one DOES resolve once given a generous timeout — this
  // one does not, at any timeout tried, which rules out "just slow" and
  // points to a genuine client-side reconciliation defect scoped to
  // FileCard/FilesTab specifically. Needs dedicated engineering
  // investigation beyond this reliability-focused phase's scope; left
  // failing (not skipped/weakened) so it isn't silently masked.
  await expect(card).toHaveCount(0, { timeout: 20_000 });
});

test("the upload dropzone works at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);

  await expect(page.getByRole("button", { name: /browse files/i })).toBeVisible();
});
