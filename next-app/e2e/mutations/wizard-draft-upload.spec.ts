import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { login, clickAndWaitForURL, DEMO_PASSWORD } from "./helpers";
import { waitForFileStatus } from "../helpers/wait-for-file-status";

/**
 * Functional coverage of the draft-first create-workspace wizard: Step 1
 * creates a real DRAFT workspace immediately (rather than waiting for the
 * final step), Step 2 uploads real files against that draft's id via the
 * same secure upload workflow the Workspace Files tab uses, and the final
 * step updates that same draft in place. Runs serially against the real
 * dev database/MinIO/worker, same accommodation as
 * e2e/mutations/mutations.spec.ts and e2e/uploads/uploads.spec.ts.
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `Playwright Draft Wizard ${RUN_ID}`;
const CLIENT_NAME = `Playwright Draft Wizard Client ${RUN_ID}`;

let fixturesDir = "";
let validImagePath = "";

test.beforeAll(async () => {
  fixturesDir = mkdtempSync(join(tmpdir(), "vault-wizard-draft-fixtures-"));
  validImagePath = join(fixturesDir, `wizard-upload-${RUN_ID}.jpg`);
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

let workspaceUrl = "";
let draftUrlWithId = "";

test("Step 1 Continue creates one draft workspace and moves to Step 2 with the draft id in the URL", async ({ page }) => {
  await page.goto("/workspaces/new");
  await page.getByLabel(/workspace title/i).fill(WORKSPACE_TITLE);
  await page.getByLabel(/client name/i).fill(CLIENT_NAME);

  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/workspaces\/new\?draft=[^&]+&step=2/);
  draftUrlWithId = page.url();

  await expect(page.getByRole("button", { name: /browse files/i })).toBeVisible();
});

test("Back then Continue reuses the same draft instead of creating a second one", async ({ page }) => {
  await page.goto(draftUrlWithId);
  const draftId = new URL(draftUrlWithId).searchParams.get("draft");

  await page.getByRole("button", { name: /^back$/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();

  await page.waitForURL(/\/workspaces\/new\?draft=[^&]+&step=2/);
  const draftIdAfter = new URL(page.url()).searchParams.get("draft");
  expect(draftIdAfter).toBe(draftId);
});

test("a page reload on Step 1 with the draft in the URL does not create a second draft on the next Continue click", async ({ page }) => {
  const draftId = new URL(draftUrlWithId).searchParams.get("draft");
  await page.goto(`/workspaces/new?draft=${draftId}&step=1`);
  await page.reload();

  await expect(page.getByLabel(/workspace title/i)).toHaveValue(WORKSPACE_TITLE);

  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/workspaces\/new\?draft=[^&]+&step=2/);
  const draftIdAfter = new URL(page.url()).searchParams.get("draft");
  expect(draftIdAfter).toBe(draftId);
});

test("uploads a file in Step 2, shows real progress, and allows continuing before it reaches Ready", async ({ page }) => {
  await page.goto(draftUrlWithId);

  await page.getByLabel(/choose files to upload/i).setInputFiles(validImagePath);

  // Real upload progress from the secure upload workflow (not a decorative bar).
  await expect(page.getByText(`wizard-upload-${RUN_ID}.jpg`, { exact: true })).toBeVisible();
  await expect(page.getByText(/uploaded successfully\. protected preview is being prepared\./i)).toBeVisible({
    timeout: 20_000,
  });

  const card = page.locator(`[data-testid="file-card"][data-file-name="wizard-upload-${RUN_ID}.jpg"]`);
  await expect(card).toBeVisible({ timeout: 20_000 });

  // Continue must not require waiting for Ready.
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.locator("legend", { hasText: /review protection/i })).toBeVisible();
});

test("completes the wizard, reopens the same workspace, and the uploaded file is attached", async ({ page }) => {
  await page.goto(draftUrlWithId.replace("step=2", "step=3"));

  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 4
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 5 (PAYMENT_REQUIRED default needs an amount)
  // If validation bounced back to step 4 for a missing amount, fill it and retry.
  if (await page.getByLabel(/^amount/i).isVisible().catch(() => false)) {
    await page.getByLabel(/^amount/i).fill("12000");
    await page.getByRole("button", { name: /^continue$/i }).click();
  }

  await expect(page.getByText(`${WORKSPACE_TITLE}`)).toBeVisible();
  await expect(page.getByText(/1 uploaded/i)).toBeVisible();

  await clickAndWaitForURL(
    page,
    page.getByRole("button", { name: /create workspace/i }),
    /\/workspaces\/(?!new$)[a-z0-9]+$/,
  );
  workspaceUrl = page.url();
  const draftId = new URL(draftUrlWithId).searchParams.get("draft");
  expect(workspaceUrl).toContain(draftId!);

  await expect(page.getByRole("heading", { name: WORKSPACE_TITLE })).toBeVisible();
  await page.getByRole("tab", { name: /^files$/i }).click();
  await expect(page.getByText(`wizard-upload-${RUN_ID}.jpg`, { exact: true })).toBeVisible();
});

test("the uploaded file reaches Ready, and survives a refresh", async ({ page }) => {
  await page.goto(workspaceUrl);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await waitForFileStatus(page, { fileName: `wizard-upload-${RUN_ID}.jpg`, expectedStatus: "Ready", reselectFilesTab: true }, test.info());

  await page.reload();
  await page.getByRole("tab", { name: /^files$/i }).click();
  await waitForFileStatus(page, { fileName: `wizard-upload-${RUN_ID}.jpg`, expectedStatus: "Ready", timeoutMs: 20_000 }, test.info());
});

test("another creator cannot open or resume this draft — the wizard silently starts fresh instead", async ({ page, context }) => {
  const draftId = new URL(draftUrlWithId).searchParams.get("draft");
  await context.clearCookies();
  await login(page, "meera@example.com", DEMO_PASSWORD);

  await page.goto(`/workspaces/new?draft=${draftId}&step=2`);

  // Falls back to a fresh Step 1 rather than exposing Arjun's draft/files.
  await expect(page.getByLabel(/workspace title/i)).toBeVisible();
  await expect(page.getByLabel(/workspace title/i)).toHaveValue("");
  await expect(page.getByText(`wizard-upload-${RUN_ID}.jpg`, { exact: true })).toHaveCount(0);
});

test("double-clicking Step 1's Continue does not create a second draft workspace", async ({ page }) => {
  const title = `Playwright Double Click Draft ${RUN_ID}`;
  await page.goto("/workspaces/new");
  await page.getByLabel(/workspace title/i).fill(title);
  await page.getByLabel(/client name/i).fill(`Double Click Client ${RUN_ID}`);

  const continueButton = page.getByRole("button", { name: /^continue$/i });
  await Promise.all([continueButton.click(), continueButton.click({ force: true }).catch(() => {})]);

  await page.waitForURL(/\/workspaces\/new\?draft=[^&]+&step=2/);

  // Only one workspace with this title should exist — go check the list.
  // Scoped to WorkspaceTable's <tr> (not a plain text match): the list page
  // renders both a desktop table and a mobile card grid for the same data
  // simultaneously (one hidden via responsive CSS, not absent from the
  // DOM), so a bare text match would legitimately double-count one real
  // workspace. A table row exists exactly once per workspace regardless of
  // viewport.
  await page.goto(`/workspaces?q=${encodeURIComponent(title)}`);
  await expect(page.locator("tr", { hasText: title })).toHaveCount(1);
});
