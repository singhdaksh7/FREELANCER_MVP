import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { login } from "../mutations/helpers";
import { waitForFileStatus } from "../helpers/wait-for-file-status";

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
  // This is the first test in the suite to wait on the file-processing
  // worker, right after the shared dev server/worker have just cold-started
  // for this run (see playwright.config.ts's webServer) — generous timeout
  // for that reason (see e2e/uploads/uploads.spec.ts's equivalent comment).
  test.setTimeout(240_000);
  await context.grantPermissions(["clipboard-write", "clipboard-read"]);
  await login(page);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();

  await page.getByLabel(/choose files to upload/i).setInputFiles([imageOnePath, imageTwoPath]);
  await waitForFileStatus(page, { fileName: `review-file-one-${RUN_ID}.jpg`, expectedStatus: "Ready", reselectFilesTab: true }, test.info());
  await waitForFileStatus(page, { fileName: `review-file-two-${RUN_ID}.jpg`, expectedStatus: "Ready", reselectFilesTab: true }, test.info());

  // Idempotent against a stale review link left over from a previous,
  // interrupted run of this same spec (this workspace isn't reset between
  // manual re-runs the way the seeded/reset database is) — revoke first if
  // one's already active, then always create fresh.
  const revokeButton = page.getByRole("button", { name: /^revoke link$/i });
  if (await revokeButton.isVisible().catch(() => false)) {
    await revokeButton.click();
    await page.getByRole("button", { name: /^revoke link$/i }).last().click();
    await expect(page.getByRole("button", { name: /create secure review link/i })).toBeVisible({ timeout: 60_000 });
  }

  await page.getByRole("button", { name: /create secure review link/i }).click();
  const linkInput = page.getByTestId("review-link-input");
  // Server Action writes the workspace + generates a secure token — the
  // default 5s expect timeout was observed to fire while the button was
  // still showing its own "Creating…" pending state under load (right
  // after two 90s file-processing waits in this same test, plus a cold
  // `next start` boot when this project runs on its own right after
  // another project's server was torn down).
  await expect(linkInput).toBeVisible({ timeout: 60_000 });
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

  await expect(page).toHaveURL(reviewLinkUrl);

  await expect(page.getByRole("heading", { name: /client review summary/i })).toBeVisible();

  // Explicitly select the current run's file-one before asserting its
  // preview — a Playwright retry leaves the previous attempt's files in
  // this isolated E2E database (this spec never deletes its own records),
  // so the portal's initially-selected file on load can't be assumed to be
  // this run's file-one; it must be selected first.
  const currentFileButton = page.getByRole("button", { name: new RegExp(`review-file-one-${RUN_ID}\\.jpg`, "i") });
  await expect(currentFileButton).toBeVisible();
  await currentFileButton.click();

  await expect(
    page.getByRole("img", { name: new RegExp(`protected preview of review-file-one-${RUN_ID}\\.jpg`, "i") }),
  ).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText(/original files unlock automatically once payment is confirmed/i).first()).toBeVisible();

  await expect(page.getByText(/escrow/i)).toHaveCount(0);
});

test("an invalid token shows the invalid-link system state", async ({ page }) => {
  await page.goto("/review/this-is-not-a-real-token-at-all");
  await expect(page.getByText(/invalid review link/i)).toBeVisible();
});

test("switches between files in the file navigation", async ({ page }) => {
  await page.goto(reviewLinkUrl);

  // Same reasoning as above: explicitly select the current run's file-two
  // rather than assuming which file the portal has selected on load.
  const currentFileTwoButton = page.getByRole("button", { name: new RegExp(`review-file-two-${RUN_ID}\\.jpg`, "i") });
  await expect(currentFileTwoButton).toBeVisible();
  await currentFileTwoButton.click();

  await expect(
    page.getByRole("img", { name: new RegExp(`protected preview of review-file-two-${RUN_ID}\\.jpg`, "i") }),
  ).toBeVisible({ timeout: 10_000 });
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

  // The sidebar defaults to Action Center, not Comments — the Comments
  // panel (and its real reviewer-name input) isn't visible until this tab
  // is opened. Selecting by `aside .getByLabel(/your name/i)` also matches
  // the hidden approval dialog's "#approve-name" input, which shares the
  // same label; the Comments tab must be opened explicitly first.
  await page.getByRole("button", { name: /comments \(/i }).click();

  const reviewerNameInput = page.getByPlaceholder(/enter your name/i);
  await expect(reviewerNameInput).toBeVisible();
  await reviewerNameInput.fill("Rohit Sharma");

  const commentInput = page.getByPlaceholder(/add a comment/i);
  await expect(commentInput).toBeVisible();
  await commentInput.fill(`Please adjust the crop — ${RUN_ID}`);

  await page.getByRole("button", { name: /^post$/i }).click();

  await expect(page.getByText(`Please adjust the crop — ${RUN_ID}`)).toBeVisible();
});

test("creator sees and replies to the client comment", async ({ page }) => {
  await login(page);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^comments$/i }).click();

  // Scoped to this run's own comment card — a global `.first()` is unsafe
  // here: seeded comments, a leftover comment from a previous retry, or
  // simply another open thread would all make `.first()` pick the wrong
  // card's Reply form (confirmed by DB evidence: a reply once landed under
  // an unrelated, older comment because of exactly this).
  const clientCommentCard = page
    .getByTestId("creator-comment-card")
    .filter({ hasText: `Please adjust the crop — ${RUN_ID}` });
  await expect(clientCommentCard).toBeVisible();

  await clientCommentCard.getByPlaceholder(/reply/i).fill(`Sure, updating now — ${RUN_ID}`);
  await clientCommentCard.getByRole("button", { name: /^reply$/i }).click();

  await expect(clientCommentCard.getByText(`Sure, updating now — ${RUN_ID}`)).toBeVisible();
});

test("creator resolves the comment", async ({ page }) => {
  await login(page);
  await page.goto(WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^comments$/i }).click();

  // Same scoping reasoning as the reply test above — never use a global
  // `.first()` for the Resolve control either.
  const clientCommentCard = page
    .getByTestId("creator-comment-card")
    .filter({ hasText: `Please adjust the crop — ${RUN_ID}` });
  await expect(clientCommentCard).toBeVisible();

  await clientCommentCard.getByRole("button", { name: /^resolve$/i }).click();
  await expect(clientCommentCard.getByText("Resolved", { exact: true })).toBeVisible();
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
  // Wait on the actual "complete" round trip response rather than any
  // transient UI text — the whole session→XHR PUT→complete sequence can
  // finish fast enough locally that "Uploading…" is never observed by a
  // polling assertion, and reloading before the request truly finishes
  // would cancel it mid-flight (confirmed via trace inspection: the
  // upload-sessions POST never got a response because a too-early reload
  // had already torn down the page).
  const completeResponsePromise = page.waitForResponse(
    (res) => /\/api\/upload-sessions\/.+\/complete$/.test(new URL(res.url()).pathname) && res.request().method() === "POST",
  );
  await cardOne.getByLabel(/upload new version/i).setInputFiles(versionTwoPath);
  const completeResponse = await completeResponsePromise;
  expect(completeResponse.ok()).toBe(true);

  // First: confirm the version-2 upload session round trip actually
  // completed and didn't silently fail (the version-upload equivalent of
  // e2e/uploads.spec.ts's "reaches Ready" assertion — without this, a
  // silently-failed upload and an already-promoted version look identical
  // to a test that only checks for absence). Reload-polls rather than
  // checking the live DOM: router.refresh() isn't reliably reflected
  // without a reload in this environment (see wait-for-file-status.ts's
  // own reload fallback for the same, already-diagnosed limitation — this
  // spec's own next assertion below relies on the identical reload-poll
  // for exactly that reason). It also accepts either a still-processing
  // candidate or an already-promoted version 2 as proof the round trip
  // succeeded — worker processing can finish fast enough that a transient
  // PROCESSING candidate is never observed before it's promoted.
  let versionTwoState: "candidate" | "promoted" | "failed" | "missing" = "missing";
  await expect
    .poll(
      async () => {
        await page.reload();
        await page.getByRole("tab", { name: /^files$/i }).click();
        if ((await cardOne.getByText(/version 2 candidate:\s*FAILED/i).count()) > 0) versionTwoState = "failed";
        else if ((await cardOne.getByText(/version 2 candidate/i).count()) > 0) versionTwoState = "candidate";
        else if ((await cardOne.getByText(/version history \(2\)/i).count()) > 0) versionTwoState = "promoted";
        else versionTwoState = "missing";
        return versionTwoState;
      },
      { timeout: 20_000, intervals: [500, 1000, 2000, 3000] },
    )
    .not.toBe("missing");
  expect(versionTwoState).not.toBe("failed");

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
  // server-verified signal that the revision was actually submitted.
  // Reload-polls rather than trusting the Server Action's own
  // revalidatePath refresh to land live: router.refresh()/automatic
  // revalidation isn't reliably reflected without a reload in this
  // environment (see wait-for-file-status.ts's own reload fallback, and
  // the previous test's identical reload-poll, for the same
  // already-diagnosed limitation).
  await expect
    .poll(
      async () => {
        await page.reload();
        await page.getByRole("tab", { name: /^files$/i }).click();
        return page.getByText(/changes requested by/i).count();
      },
      { timeout: 20_000, intervals: [500, 1000, 2000, 3000] },
    )
    .toBe(0);
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
  // Reassurance copy that originals stay locked until payment — the exact
  // wording differs by PaymentPanel phase ("remain locked until payment is
  // confirmed" while a payment attempt is in flight; "unlock only after
  // your payment is confirmed" in the default ready-to-pay state this test
  // lands on), so match on the shared "unlock/lock ... payment" meaning
  // rather than one literal phase's copy.
  await expect(page.getByText(/lock(ed)?.*payment|unlock.*payment/i).first()).toBeVisible();
});

test("a direct refresh of the review page maintains access", async ({ page }) => {
  await page.goto(reviewLinkUrl);
  await page.reload();
  // The portal renders normally (not an invalid/revoked-link system state)
  // — this heading is always present on a successfully token-authorized
  // load, so its presence is the durable signal access was maintained.
  await expect(page.getByRole("heading", { name: /client review summary/i })).toBeVisible();
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
