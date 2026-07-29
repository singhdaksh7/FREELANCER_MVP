import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./helpers";

/**
 * PREVIEW_ONLY: the portal structurally never renders an Approve, payment,
 * or download control — see DELIVERY_MODES.md (review-portal.tsx's
 * `canApprove = ... && !isPreviewOnly`).
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA Preview Only ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let filePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-preview-only-"));
  filePath = await writeValidJpegFixture(dir, `preview-only-${RUN_ID}.jpg`);
});

test("creates a PREVIEW_ONLY workspace and generates a review link", async ({ page }) => {
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, deliveryMode: "PREVIEW_ONLY" });
  await uploadFileAndWaitReady(page, workspaceUrl, filePath);
  reviewLinkUrl = await createReviewLink(page);
});

test("the client portal never shows an approve, payment, or download control", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(reviewLinkUrl);

  await expect(page.getByText(/secure preview/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^approve project$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /pay and unlock files/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /download original/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);

  // Commenting and requesting changes remain available — PREVIEW_ONLY only
  // removes approval/payment/download, not feedback.
  await expect(page.getByRole("button", { name: /^request changes$/i })).toBeVisible();
});
