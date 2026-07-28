import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { login } from "../mutations/helpers";

/**
 * Functional coverage of the Phase 6 secure client-review workflow against
 * the real dev database, real MinIO, and the real file-processing worker
 * (playwright.config.ts's second webServer entry) — one file, serial, for
 * the same shared-dev-server-process reason documented in
 * e2e/mutations/mutations.spec.ts and e2e/uploads/uploads.spec.ts. Uses the
 * seeded IN_REVIEW workspace ws_brand_identity (Arjun's), which has zero
 * files by design (Phase 5 seed intentionally created none) — distinct
 * from ws_social_campaign, which e2e/uploads owns, so the two suites never
 * contend for the same workspace even if ever run back to back.
 *
 * A single Playwright `page`/context is reused across both "creator" and
 * "client" steps — the review portal has no session/cookie dependency at
 * all (a completely token-authorized, separate trust path — see
 * REVIEW_TOKEN_SECURITY.md), so an authenticated creator cookie being
 * present in the same browser context never affects it.
 *
 * Not covered here (covered instead by the real-database integration
 * suite, src/data-access/review-workflow.integration.test.ts): the expired
 * -link system state, since reaching it requires directly manipulating
 * `expiresAt` in the database, which this E2E layer deliberately never
 * does (every other spec in this app drives state through the real UI
 * only).
 */
test.describe.configure({ mode: "serial" });

const WORKSPACE_PATH = "/workspaces/ws_brand_identity";
const RUN_ID = Date.now();

let fixturesDir = "";
let imageOnePath = "";
let imageTwoPath = "";
let versionTwoPath = "";
let reviewLinkUrl = "";

test.beforeAll(async () => {
  fixturesDir = mkdtempSync(join(tmpdir(), "vault-review-fixtures-"));

  imageOnePath = join(fixturesDir, `review-file-one-${RUN_ID}.jpg`);
  writeFileSync(
    imageOnePath,
    await sharp({ create: { width: 700, height: 500, channels: 3, background: { r: 60, g: 120, b: 200 } } }).jpeg().toBuffer(),
  );

  imageTwoPath = join(fixturesDir, `review-file-two-${RUN_ID}.jpg`);
  writeFileSync(
    imageTwoPath,
    await sharp({ create: { width: 700, height: 500, channels: 3, background: { r: 200, g: 120, b: 60 } } }).jpeg().toBuffer(),
  );

  versionTwoPath = join(fixturesDir, `review-file-one-v2-${RUN_ID}.jpg`);
  writeFileSync(
    versionTwoPath,
    await sharp({ create: { width: 900, height: 650, channels: 3, background: { r: 30, g: 200, b: 120 } } }).jpeg().toBuffer(),
  );
});

test("creator uploads two files, generates and copies a secure review link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-write", "clipboard-read"]);
  await login(page);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles([imageOnePath, imageTwoPath]);
  const cardOne = page.locator(`[data-testid="file-card"][data-file-name="review-file-one-${RUN_ID}.jpg"]`);
  const cardTwo = page.locator(`[data-testid="file-card"][data-file-name="review-file-two-${RUN_ID}.jpg"]`);
  await expect(cardOne.getByText("Ready", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(cardTwo.getByText("Ready", { exact: true })).toBeVisible({ timeout: 20_000 });

  // Idempotent against a stale review link left over from a previous,
  // interrupted run of this same spec (this workspace isn't reset between
  // manual re-runs the way the seeded/reset database is) — revoke first if
  // one's already active, then always create fresh.
  const revokeButton = page.getByRole("button", { name: /^revoke link$/i });
  if (await revokeButton.isVisible().catch(() => false)) {
    await revokeButton.click();
    await page.getByRole("button", { name: /^revoke link$/i }).last().click();
    await expect(page.getByRole("button", { name: /create secure review link/i })).toBeVisible();
  }

  await page.getByRole("button", { name: /create secure review link/i }).click();
  const linkInput = page.getByTestId("review-link-input");
  await expect(linkInput).toBeVisible();
  reviewLinkUrl = await linkInput.inputValue();
  expect(reviewLinkUrl).toMatch(/\/review\/[A-Za-z0-9_-]{40,}$/);

  await page.getByRole("button", { name: /copy link/i }).click();
  // Either the real Clipboard API succeeded ("Copied") or the accessible
  // fallback message appeared — both are correct outcomes depending on
  // what clipboard permission the browser context actually grants; the
  // component must never silently do nothing either way.
  await expect(
    page.getByRole("button", { name: /copied/i }).or(page.getByText(/clipboard access isn.t available/i)),
  ).toBeVisible();
});

test("opening the review link directly shows the protected portal, no creator account required", async ({ page, context }) => {
  await context.clearCookies(); // simulate a client with no creator session at all
  await page.goto(reviewLinkUrl);

  await expect(page.getByText(/secure preview/i)).toBeVisible();
  await expect(page.getByRole("button", { name: `review-file-one-${RUN_ID}.jpg` })).toBeVisible();
  await expect(page.getByText(/original files remain securely locked until payment is completed/i).first()).toBeVisible();
  await expect(page.getByText(/escrow/i)).toHaveCount(0);
});

test("an invalid token shows the invalid-link system state", async ({ page }) => {
  await page.goto("/review/this-is-not-a-real-token-at-all");
  await expect(page.getByText(/invalid review link/i)).toBeVisible();
});

test("switches between files in the file navigation", async ({ page }) => {
  await page.goto(reviewLinkUrl);
  await page.getByRole("button", { name: `review-file-two-${RUN_ID}.jpg` }).click();
  await expect(page.getByRole("img", { name: new RegExp(`protected preview of review-file-two-${RUN_ID}\\.jpg`, "i") })).toBeVisible({
    timeout: 10_000,
  });
});

test("opens the mobile comments bottom sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(reviewLinkUrl);

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);

  await page.getByRole("button", { name: /comments \(/i }).click();
  await expect(page.getByRole("dialog", { name: /comments/i })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("client adds a comment", async ({ page }) => {
  await page.goto(reviewLinkUrl);
  await page.locator("aside").getByLabel(/your name/i).fill("Rohit Sharma");
  await page.getByPlaceholder(/add a comment/i).fill(`Please adjust the crop — ${RUN_ID}`);
  await page.getByRole("button", { name: /^post$/i }).click();

  await expect(page.getByText(`Please adjust the crop — ${RUN_ID}`)).toBeVisible();
});

test("creator sees and replies to the client comment", async ({ page }) => {
  await login(page);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^comments$/i }).click();

  await expect(page.getByText(`Please adjust the crop — ${RUN_ID}`)).toBeVisible();
  await page.getByPlaceholder(/reply/i).first().fill(`Sure, updating now — ${RUN_ID}`);
  await page.getByRole("button", { name: /^reply$/i }).first().click();

  await expect(page.getByText(`Sure, updating now — ${RUN_ID}`)).toBeVisible();
});

test("creator resolves the comment", async ({ page }) => {
  await login(page);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^comments$/i }).click();

  await page.getByRole("button", { name: /^resolve$/i }).first().click();
  await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();
});

test("client requests changes", async ({ page }) => {
  await page.goto(reviewLinkUrl);
  await page.getByRole("button", { name: /^request changes$/i }).click();
  await page.getByLabel(/what would you like changed/i).fill(`Please brighten the second image — ${RUN_ID}`);
  await page.getByRole("button", { name: /^submit changes$/i }).click();

  await expect(page.getByText(/change request submitted/i).first()).toBeVisible();
});

test("creator sees the change request and uploads a new version", async ({ page }) => {
  await login(page);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await expect(page.getByText(/changes requested/i).first()).toBeVisible();
  await expect(page.getByText(`Please brighten the second image — ${RUN_ID}`)).toBeVisible();

  const cardOne = page.locator(`[data-testid="file-card"][data-file-name="review-file-one-${RUN_ID}.jpg"]`);
  await cardOne.getByLabel(/upload new version/i).setInputFiles(versionTwoPath);

  // First: confirm the version-2 upload session round trip actually
  // completed and produced a visible PROCESSING/READY/FAILED candidate
  // (the version-upload equivalent of e2e/uploads.spec.ts's "reaches
  // Ready" assertion — without this, a silently-failed upload and an
  // already-promoted version look identical to a test that only checks
  // for absence).
  await expect(cardOne.getByText(/version 2 candidate/i)).toBeVisible({ timeout: 15_000 });
  await expect(cardOne.getByText(/version 2 candidate:\s*FAILED/i)).toHaveCount(0);

  // Then: real worker processing promotes the candidate to current
  // atomically on success, which clears WorkspaceFile.pendingVersionId —
  // poll (reloading, since FilesTab's own auto-poll only fires within a
  // single page load) until the candidate note is gone.
  await expect
    .poll(
      async () => {
        await page.reload();
        await page.getByRole("tab", { name: /^files$/i }).click();
        return cardOne.getByText(/version 2 candidate/i).count();
      },
      { timeout: 20_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(0);
});

test("creator submits the revision for review", async ({ page }) => {
  await login(page);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByRole("button", { name: /submit revision for review/i }).click();

  // The change-request banner (and its "Changes requested by ..." heading)
  // disappears once the workspace is back in IN_REVIEW — the durable,
  // server-verified signal that the revision was actually submitted,
  // rather than racing a transient confirmation message against the
  // Server Action's own revalidatePath refresh.
  await expect(page.getByText(/changes requested by/i)).toHaveCount(0, { timeout: 10_000 });
  await page.reload();
  await page.getByRole("tab", { name: /^files$/i }).click();
  await expect(page.getByText(/changes requested by/i)).toHaveCount(0);
});

test("client sees the newly submitted version 2", async ({ page }) => {
  await page.goto(reviewLinkUrl);
  await page.getByRole("button", { name: `review-file-one-${RUN_ID}.jpg` }).click();
  await expect(page.getByRole("button", { name: "v2" })).toBeVisible();
});

test("client approves the project and sees a confirmation", async ({ page }) => {
  await page.goto(reviewLinkUrl);
  await page.getByRole("button", { name: /^approve project$/i }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: /approve this project/i });
  await dialog.getByLabel(/your name/i).fill("Rohit Sharma");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: /^approve project$/i }).click();

  await expect(page.getByText(/approved by rohit sharma/i)).toBeVisible({ timeout: 10_000 });
});

test("original download remains unavailable after approval", async ({ page }) => {
  await page.goto(reviewLinkUrl);
  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /download original/i })).toHaveCount(0);
  await expect(page.getByText(/originals still locked|remain securely locked/i).first()).toBeVisible();
});

test("a direct refresh of the review page maintains access", async ({ page }) => {
  await page.goto(reviewLinkUrl);
  await page.reload();
  await expect(page.getByText(/secure preview/i)).toBeVisible();
});

test("revoking the link from the creator side shows the revoked system state to the client", async ({ page }) => {
  await login(page);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("button", { name: /^revoke link$/i }).click();
  await page.getByRole("button", { name: /^revoke link$/i }).last().click();
  // The durable, server-verified signal that revocation happened: the
  // "Create Secure Review Link" control reappears once there's no longer
  // an active link (see ConfirmDialog's own close-on-success behavior for
  // why an inline confirmation message isn't a reliable thing to assert
  // against here).
  await expect(page.getByRole("button", { name: /create secure review link/i })).toBeVisible({ timeout: 10_000 });

  await page.goto(reviewLinkUrl);
  await expect(page.getByText(/secure link revoked/i)).toBeVisible();
});
