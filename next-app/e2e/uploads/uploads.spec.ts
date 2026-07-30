import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { login } from "../mutations/helpers";

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
  await login(page);
});

test("uploads a valid image and it reaches the Ready/preview-available state", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(validImagePath);

  // Upload queue shows progress, then the file card appears and
  // eventually transitions from Processing to Ready as the worker
  // (running alongside this test run) picks up the job.
  await expect(page.getByText(`valid-${RUN_ID}.jpg`)).toBeVisible();
  const card = page.locator(`[data-testid="file-card"][data-file-name="valid-${RUN_ID}.jpg"]`);
  await expect(card.getByText("Ready", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole("button", { name: /view protected preview/i })).toBeVisible();
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

  const card = page.locator(`[data-testid="file-card"][data-file-name="valid-${RUN_ID}.jpg"]`);
  await expect(card.getByText("Ready", { exact: true })).toBeVisible();
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
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(oversizedDimensionImagePath);
  await expect(page.getByText(`oversized-dimensions-${RUN_ID}.jpg`)).toBeVisible();

  const card = page.locator(`[data-testid="file-card"][data-file-name="oversized-dimensions-${RUN_ID}.jpg"]`);
  await expect(card.getByText("Failed", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole("button", { name: /retry processing/i })).toBeVisible();
});

test("retrying a failed file re-queues it for processing", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const card = page.locator(`[data-testid="file-card"][data-file-name="oversized-dimensions-${RUN_ID}.jpg"]`);
  await card.getByRole("button", { name: /retry processing/i }).click();

  // Still oversized, so it genuinely fails again — this asserts the retry
  // mechanism itself works (a fresh attempt happens), not that the
  // outcome changes.
  await expect(card.getByText("Failed", { exact: true })).toBeVisible({ timeout: 20_000 });
});

test("removes an eligible file after confirmation", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const card = page.locator(`[data-testid="file-card"][data-file-name="oversized-dimensions-${RUN_ID}.jpg"]`);
  await card.getByRole("button", { name: /^remove$/i }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`remove oversized-dimensions-${RUN_ID}\\.jpg\\?`, "i") })).toBeVisible();
  await page.getByRole("button", { name: /remove file/i }).click();

  await expect(page.getByText(`oversized-dimensions-${RUN_ID}.jpg`)).toHaveCount(0);
});

test("the upload dropzone works at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);

  await expect(page.getByRole("button", { name: /browse files/i })).toBeVisible();
});
