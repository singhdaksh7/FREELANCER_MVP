import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./helpers";

/**
 * Completed master review link rendered read-only. Routed through
 * PREVIEW_ONLY + the creator's "Close Project" action (CLOSED) rather than
 * a real payment capture, since reaching a terminal state this way avoids
 * depending on the external Razorpay gateway — see DELIVERY_MODES.md.
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA Completed Master Link ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let filePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-completed-link-"));
  filePath = await writeValidJpegFixture(dir, `completed-master-link-${RUN_ID}.jpg`);
});

test("creates a PREVIEW_ONLY workspace, generates a link, then closes the project", async ({ page }) => {
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, deliveryMode: "PREVIEW_ONLY" });
  await uploadFileAndWaitReady(page, workspaceUrl, filePath);
  reviewLinkUrl = await createReviewLink(page);

  await page.goto(workspaceUrl);
  await page.getByRole("button", { name: /^close project$/i }).click();
  await expect(page.getByRole("heading", { name: /close this project for review/i })).toBeVisible();
  await page.getByRole("button", { name: /yes, close project/i }).click();

  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
});

test("the master review link now renders read-only for the client", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(reviewLinkUrl);

  await expect(page.getByText(/secure preview/i)).toBeVisible();
  // Read-only: no comment box, no request-changes control, no approve control.
  await expect(page.getByRole("button", { name: /^request changes$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^approve project$/i })).toHaveCount(0);
  await expect(page.getByPlaceholder(/add a comment/i)).toHaveCount(0);
});
