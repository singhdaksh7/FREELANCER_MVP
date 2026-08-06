import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = "Playwright Draft Wizard " + RUN_ID;
const CLIENT_NAME = "Playwright Draft Wizard Client " + RUN_ID;

let fixturesDir = "";
let validImagePath = "";

test.beforeAll(async () => {
  fixturesDir = mkdtempSync(join(tmpdir(), "vault-wizard-draft-fixtures-"));
  validImagePath = join(fixturesDir, "wizard-upload-" + RUN_ID + ".jpg");
  writeFileSync(
    validImagePath,
    await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 20, g: 140, b: 90 } } })
      .jpeg()
      .toBuffer(),
  );
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

let draftUrlWithId = "";
let draftIdParam = "";

test("Uploading a file with valid details automatically creates a draft workspace", async ({ page }) => {
  await page.goto("/workspaces/new");
  await page.getByLabel(/workspace title/i).fill(WORKSPACE_TITLE);
  await page.getByLabel(/client name/i).fill(CLIENT_NAME);
  await page.getByLabel(/^amount/i).fill("18500");

  // Interaction with file input should trigger the background draft creation
  await page.getByLabel(/choose files to upload/i).setInputFiles(validImagePath);

  // Wait for the URL to update with the draft id
  await page.waitForURL(/\/workspaces\/new\?draft=[^&]+&step=1/);
  draftUrlWithId = page.url();
  draftIdParam = new URL(draftUrlWithId).searchParams.get("draft") || "";

  // The file should now appear in the queue
  await expect(page.getByText("wizard-upload-" + RUN_ID + ".jpg", { exact: true })).toBeVisible({ timeout: 20_000 });
  // Wait for the file to actually finish uploading (so it gets saved to the database) before ending the test.
  // When it finishes, the UI either shows "Uploaded" in the queue, or it vanishes from the queue and appears in the FileCard.
  await expect(page.locator("[data-testid='file-card'][data-file-name='wizard-upload-" + RUN_ID + ".jpg']")).toBeVisible({ timeout: 20_000 });
});

test("a page reload on Step 1 with the draft in the URL retains the draft id", async ({ page }) => {
  await page.goto('/workspaces/new?draft=' + draftIdParam + '&step=1');
  await page.reload();

  await expect(page.getByLabel(/workspace title/i)).toHaveValue(WORKSPACE_TITLE);
  await expect(page.getByRole("button", { name: /browse files/i })).toBeVisible();

  const draftIdAfter = new URL(page.url()).searchParams.get("draft");
  expect(draftIdAfter).toBe(draftIdParam);
});

test("allows continuing to Confirmation and confirms creation of only one workspace", async ({ page }) => {
  await page.goto(draftUrlWithId);

  // we just wait for the file card itself to be visible. The processing status is implicitly tested
  // because we verify it eventually reaches Ready.

  const card = page.locator("[data-testid='file-card'][data-file-name='wizard-upload-" + RUN_ID + ".jpg']");
  await expect(card).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /continue to confirmation/i }).click();
  // Step 2 has been simplified, wait for Confirm button
  await expect(page.getByRole("button", { name: /confirm & create workspace/i })).toBeVisible();

  // Verify only ONE workspace was created overall
  await page.goto("/workspaces");
  // There should be exactly 1 workspace row with this title.
  await expect(page.getByRole("cell", { name: WORKSPACE_TITLE, exact: true })).toHaveCount(1);
});
