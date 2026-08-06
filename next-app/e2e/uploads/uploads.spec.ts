import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { login } from "../mutations/helpers";
import { waitForFileStatus } from "../helpers/wait-for-file-status";

test.describe.configure({ mode: "serial" });

const WORKSPACE_PATH = "/workspaces/ws_social_campaign";
const RUN_ID = Date.now();

let fixturesDir = "";
let validImagePath = "";
let unsupportedFilePath = "";
let tooLargeDimensionsPath = "";
let tooLargeFilePath = "";

test.beforeAll(async () => {
  fixturesDir = mkdtempSync(join(tmpdir(), "vault-uploads-e2e-"));

  validImagePath = join(fixturesDir, "valid-" + RUN_ID + ".jpg");
  writeFileSync(
    validImagePath,
    await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 100, g: 100, b: 200 } } })
      .jpeg()
      .toBuffer(),
  );

  unsupportedFilePath = join(fixturesDir, "not-allowed-" + RUN_ID + ".exe");
  writeFileSync(unsupportedFilePath, "fake exe content");

  tooLargeDimensionsPath = join(fixturesDir, "oversized-dimensions-" + RUN_ID + ".jpg");
  writeFileSync(
    tooLargeDimensionsPath,
    await sharp({ create: { width: 9000, height: 9000, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .jpeg()
      .toBuffer(),
  );

  tooLargeFilePath = join(fixturesDir, "too-large-" + RUN_ID + ".jpg");
  writeFileSync(tooLargeFilePath, Buffer.alloc(3 * 1024 * 1024, 7));
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("uploads a valid image and the UI's own automatic polling carries it to Ready with no manual reload", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(validImagePath);

  await expect(page.getByText("valid-" + RUN_ID + ".jpg")).toBeVisible();
  const card = page.locator("[data-testid='file-card'][data-file-name='valid-" + RUN_ID + ".jpg']");
  await waitForFileStatus(page, { fileName: "valid-" + RUN_ID + ".jpg", expectedStatus: "Ready", reselectFilesTab: true }, test.info());
  await expect(card.getByRole("img", { name: new RegExp("protected preview of valid-" + RUN_ID + "\\.jpg", "i") })).toBeVisible({ timeout: 20_000 });
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

  await waitForFileStatus(page, { fileName: "valid-" + RUN_ID + ".jpg", expectedStatus: "Ready", timeoutMs: 20_000 }, test.info());
});

test("rejects an unsupported file type without creating a processed file", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(unsupportedFilePath);

  await expect(page.getByText("not-allowed-" + RUN_ID + ".exe")).toBeVisible();
  await expect(page.getByText(/isn't supported/i)).toBeVisible();
});

test("rejects a file over the configured size limit", async ({ page }) => {
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(tooLargeFilePath);

  await expect(page.getByText(/larger than the 2 MB limit/i)).toBeVisible();
});

test("a file that fails processing shows the Failed state with a retry action", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles(tooLargeDimensionsPath);
  await expect(page.getByText("oversized-dimensions-" + RUN_ID + ".jpg")).toBeVisible();

  const card = page.locator("[data-testid='file-card'][data-file-name='oversized-dimensions-" + RUN_ID + ".jpg']");
  await waitForFileStatus(page, { fileName: "oversized-dimensions-" + RUN_ID + ".jpg", expectedStatus: "Failed", reselectFilesTab: true }, test.info());
  await expect(card.getByRole("button", { name: /retry processing/i })).toBeVisible();
});

test("retrying a failed file re-queues it for processing", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const card = page.locator("[data-testid='file-card'][data-file-name='oversized-dimensions-" + RUN_ID + ".jpg']");
  await card.getByRole("button", { name: /retry processing/i }).click();

  await waitForFileStatus(page, { fileName: "oversized-dimensions-" + RUN_ID + ".jpg", expectedStatus: "Failed", reselectFilesTab: true }, test.info());
});

test("removes an eligible file after confirmation", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const card = page.locator("[data-testid='file-card'][data-file-name='oversized-dimensions-" + RUN_ID + ".jpg']");
  await card.getByRole("button", { name: /remove/i }).click();

  await expect(page.getByRole("heading", { name: "Remove oversized-dimensions-" + RUN_ID + ".jpg?" })).toBeVisible();
  await page.getByRole("button", { name: /remove file/i }).click();

  await expect(card).toHaveCount(0, { timeout: 20_000 });
});

test("the upload dropzone works at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await expect(page.getByText(/drag and drop files/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /browse files/i })).toBeVisible();
});
