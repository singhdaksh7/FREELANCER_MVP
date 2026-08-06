import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./helpers";

/**
 * Version 1 and Version 2 conversations remain separate — ReviewComment.fileVersionId
 * is surfaced end-to-end, and a reply always inherits the parent's
 * file/version even though a newer version is current. See
 * REQUIREMENTS_ALIGNMENT.md §2-5.
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA Version Conversation ${RUN_ID}`;
const FILE_NAME = `ra-version-conv-${RUN_ID}.jpg`;
const V1_COMMENT = `V1-only comment ${RUN_ID}`;
const V2_COMMENT = `V2-only comment ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let filePathV1 = "";
let filePathV2 = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-version-conv-"));
  filePathV1 = join(dir, FILE_NAME);
  writeFileSync(
    filePathV1,
    await sharp({ create: { width: 700, height: 500, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer(),
  );
  filePathV2 = join(dir, `v2-${FILE_NAME}`);
  writeFileSync(
    filePathV2,
    await sharp({ create: { width: 900, height: 650, channels: 3, background: { r: 200, g: 60, b: 30 } } }).jpeg().toBuffer(),
  );
});

test("creator uploads v1, generates a review link, and the client comments on v1", async ({ page, context }) => {
  // See approval-only.spec.ts's equivalent comment: real upload/worker
  // processing plus a review-link Server Action needs more than the
  // default 30s test timeout.
  test.setTimeout(120_000);
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, amount: "5000", files: [filePathV1] });
  reviewLinkUrl = await createReviewLink(page);

  await context.clearCookies();
  await page.goto(reviewLinkUrl);
  // The sidebar defaults to Action Center, not Comments — the Comments
  // panel (and its real reviewer-name input) isn't visible until this tab
  // is opened. Without this, `aside .getByLabel(/your name/i)` can resolve
  // to the hidden Approve dialog's "#approve-name" input, which shares the
  // same label (see e2e/review/review.spec.ts's identical comment).
  await page.getByRole("button", { name: /comments \(/i }).click();
  await page.locator("aside").getByLabel(/your name/i).fill("Rohit Sharma");
  await page.getByPlaceholder(/add a comment/i).fill(V1_COMMENT);
  await page.getByRole("button", { name: /^post$/i }).click();
  await expect(page.getByText(V1_COMMENT)).toBeVisible();
});

test("creator uploads v2, and the client comments on v2 separately", async ({ page, context }) => {
  // A new version only becomes client-visible (FileVersion.submittedAt set)
  // once the creator explicitly "Submits Revision for Review" — which only
  // renders while there's an active change request. So the client must
  // request changes first, exactly like e2e/review/review.spec.ts's flow.
  // Real worker processing for the v2 candidate plus several polls needs
  // more than the default 30s test timeout under load.
  test.setTimeout(120_000);
  await context.clearCookies();
  await page.goto(reviewLinkUrl);
  await page.getByRole("button", { name: /^request changes$/i }).click();
  await page.getByLabel(/what would you like changed/i).fill(`Please revise for v2 — ${RUN_ID}`);
  await page.getByRole("button", { name: /^submit changes$/i }).click();
  await expect(page.getByText(/change request submitted/i).first()).toBeVisible();

  await login(page);
  await page.goto(workspaceUrl);
  await page.getByRole("tab", { name: /^files$/i }).click();
  const card = page.locator(`[data-testid="file-card"][data-file-name="${FILE_NAME}"]`);
  // Wait on the actual "complete" round trip response rather than any
  // transient UI text or a live (non-reload) DOM check — router.refresh()
  // isn't reliably reflected without a reload in this environment (see
  // e2e/review/review.spec.ts's identical, already-diagnosed fix), and
  // reloading before the request truly finishes would cancel it mid-flight.
  const completeResponsePromise = page.waitForResponse(
    (res) => /\/api\/upload-sessions\/.+\/complete$/.test(new URL(res.url()).pathname) && res.request().method() === "POST",
  );
  await card.getByLabel(/upload new version/i).setInputFiles(filePathV2);
  const completeResponse = await completeResponsePromise;
  expect(completeResponse.ok()).toBe(true);

  await expect
    .poll(
      async () => {
        await page.reload();
        await page.getByRole("tab", { name: /^files$/i }).click();
        return card.getByText(/version 2 candidate/i).count();
      },
      { timeout: 20_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(0);

  await page.getByRole("button", { name: /submit revision for review/i }).click();
  await expect(page.getByRole("button", { name: /submit revision for review/i })).not.toBeVisible();

  await context.clearCookies();
  await page.goto(reviewLinkUrl);
  await page.getByRole("button", { name: "v2" }).click();
  await page.getByRole("button", { name: /comments \(/i }).click();
  await page.locator("aside").getByLabel(/your name/i).fill("Rohit Sharma");
  await page.getByPlaceholder(/add a comment/i).fill(V2_COMMENT);
  await page.getByRole("button", { name: /^post$/i }).click();
  await expect(page.getByText(V2_COMMENT)).toBeVisible();
});

test("the creator's Comments tab keeps v1 and v2 conversations disjoint when filtered by version", async ({ page }) => {
  await login(page);
  await page.goto(workspaceUrl);
  await page.getByRole("tab", { name: /^comments$/i }).click();

  await expect(page.getByText(V1_COMMENT)).toBeVisible();
  await expect(page.getByText(V2_COMMENT)).toBeVisible();

  // The Version filter only appears once a specific (multi-version) File is selected.
  await page.getByRole("combobox", { name: /^file$/i }).selectOption({ label: FILE_NAME });

  const versionFilter = page.getByRole("combobox", { name: /^version$/i });
  await versionFilter.selectOption({ label: "v1" });
  await expect(page.getByText(V1_COMMENT)).toBeVisible();
  await expect(page.getByText(V2_COMMENT)).toHaveCount(0);

  await versionFilter.selectOption({ label: "v2" });
  await expect(page.getByText(V2_COMMENT)).toBeVisible();
  await expect(page.getByText(V1_COMMENT)).toHaveCount(0);
});
