import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink, approveAsClient } from "./helpers";

/**
 * APPROVAL_ONLY: client approves with no payment CTA ever rendered, and
 * only an explicit creator "Approve & Release Files" action unlocks
 * delivery — see DELIVERY_MODES.md.
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA Approval Only ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let filePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-approval-only-"));
  filePath = await writeValidJpegFixture(dir, `approval-only-${RUN_ID}.jpg`);
});

test("creates an APPROVAL_ONLY workspace and generates a review link", async ({ page }) => {
  // Creates a workspace, uploads a file, and waits for real worker
  // processing plus a review-link Server Action — same cold-start/under-load
  // headroom uploads.spec.ts's and review.spec.ts's first tests already
  // budget for; the default 30s test timeout was observed to cut this test
  // off mid-wait even though the underlying operations were still healthy.
  test.setTimeout(120_000);
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, deliveryMode: "APPROVAL_ONLY", files: [filePath] });
  reviewLinkUrl = await createReviewLink(page);
});

test("client approves and never sees a payment CTA", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(reviewLinkUrl);
  await approveAsClient(page);

  await expect(page.getByRole("button", { name: /pay and unlock files/i })).toHaveCount(0);
  await expect(page.getByText(/approved/i).first()).toBeVisible();
  // APPROVAL_ONLY's dedicated "waiting for creator" reassurance copy — see
  // ApprovalOnlyDeliveryPanel.
  await expect(page.getByText(/waiting for the freelancer to release the final files/i)).toBeVisible();
});

test("creator releases the approved files, unlocking delivery", async ({ page }) => {
  await login(page);
  await page.goto(workspaceUrl);

  await page.getByRole("button", { name: /approve & release files/i }).click();
  await expect(page.getByRole("heading", { name: /release the approved files to your client/i })).toBeVisible();
  await page.getByRole("button", { name: /yes, release files/i }).click();

  // The workspace stays AWAITING_CREATOR_RELEASE (so "Release Approved
  // Files" keeps rendering) until the delivery worker actually finishes and
  // flips it to FILES_UNLOCKED — see delivery-release.ts's doc comment.
  // Poll for that real, worker-driven completion rather than the button's
  // (unchanged) presence.
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText("Files Unlocked", { exact: true }).count();
      },
      { timeout: 30_000, intervals: [1000, 2000, 3000, 5000] },
    )
    .toBeGreaterThan(0);
});

test("client sees Download Approved Files once the delivery worker finishes, and only then", async ({ page, context }) => {
  // The prior test already polled until the workspace reached
  // FILES_UNLOCKED, so a single page load is enough here — the client
  // portal's own ApprovalOnlyDeliveryPanel does the status-poll ->
  // claim-session round trip in-page (no manual reload needed); just
  // give its async fetch chain time to settle via toBeVisible's
  // auto-retrying wait rather than a manual reload loop, which raced
  // against React hydration/fetch timing and produced false negatives.
  test.setTimeout(60_000);
  await context.clearCookies();
  await page.goto(reviewLinkUrl);

  const downloadLink = page.getByRole("link", { name: /download approved files/i });
  await expect(downloadLink).toBeVisible({ timeout: 20_000 });

  const href = await downloadLink.getAttribute("href");
  expect(href).toMatch(/^\/download\//);
});
