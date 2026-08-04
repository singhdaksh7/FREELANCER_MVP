import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./helpers";

/**
 * Numbered image-pin creation at a mobile viewport (tap). PinOverlay's
 * placement handler is a plain `onClick` (see pin-overlay.tsx), so it
 * fires identically for a real touch tap and a mouse click — this repo's
 * existing mobile coverage (e.g. e2e/mutations/mutations.spec.ts's "wizard
 * is usable at a mobile viewport" test) likewise validates mobile behavior
 * via a resized viewport rather than real touch-event emulation.
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA Image Pin Mobile ${RUN_ID}`;
const PIN_BODY = `Adjust this on mobile — ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let filePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-pin-mobile-"));
  filePath = await writeValidJpegFixture(dir, `pin-mobile-${RUN_ID}.jpg`);
});

test("creator uploads an image and generates a review link", async ({ page }) => {
  // See approval-only.spec.ts's equivalent comment: real upload/worker
  // processing plus a review-link Server Action needs more than the
  // default 30s test timeout.
  test.setTimeout(120_000);
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, amount: "5000" });
  await uploadFileAndWaitReady(page, workspaceUrl, filePath);
  reviewLinkUrl = await createReviewLink(page);
});

test("client places a numbered pin on the image at a mobile viewport", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.clearCookies();
  await page.goto(reviewLinkUrl);

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);

  await page.getByRole("button", { name: /^add pin$/i }).click();
  const overlay = page.locator('div[role="presentation"]');
  await overlay.click({ position: { x: 60, y: 50 } });

  // Placing a pin auto-opens the mobile comments bottom sheet
  // (role="dialog", aria-label="Comments" — see review-portal.tsx); the
  // desktop <aside> copy of the same composer also stays in the DOM
  // (CSS-hidden, not removed), so scope to the dialog to avoid a
  // strict-mode match on both.
  const commentsSheet = page.getByRole("dialog", { name: /comments/i });
  const pinComposer = commentsSheet.getByPlaceholder(/describe this pin/i);
  await expect(pinComposer).toBeVisible();
  // Both the desktop <aside> and mobile dialog render ReviewCommentsPanel
  // with the same id="reviewer-name" (duplicate ids across the two
  // responsive copies), which confuses getByLabel's for-attribute
  // resolution even when scoped to the dialog — use the placeholder text
  // instead, which doesn't have that ambiguity.
  await commentsSheet.getByPlaceholder(/enter your name/i).fill("Rohit Sharma");
  await pinComposer.fill(PIN_BODY);
  await page.getByRole("button", { name: /^post$/i }).click();

  await expect(page.getByRole("button", { name: `Pin 1: ${PIN_BODY}` })).toBeVisible({ timeout: 10_000 });
});
