import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./helpers";

/** Client support-ticket creation through a review link — see client-support-modal.tsx. */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA Client Support Ticket ${RUN_ID}`;
const SUBJECT = `RA Client Ticket ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let filePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-client-ticket-"));
  filePath = await writeValidJpegFixture(dir, `client-ticket-${RUN_ID}.jpg`);
});

test("creator uploads a file and generates a review link", async ({ page }) => {
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, amount: "5000" });
  await uploadFileAndWaitReady(page, workspaceUrl, filePath);
  reviewLinkUrl = await createReviewLink(page);
});

test("client raises a support ticket from the review portal", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(reviewLinkUrl);

  await page.getByRole("button", { name: /^support$/i }).click();
  const dialog = page.getByRole("dialog", { name: /^support$/i });
  await expect(dialog).toBeVisible();

  await dialog.locator('select[name="category"]').selectOption({ label: "Delivery" });
  await dialog.locator('input[name="subject"]').fill(SUBJECT);
  await dialog.locator('textarea[name="description"]').fill(`Client-reported issue for ${SUBJECT}`);
  await dialog.getByRole("button", { name: /^submit ticket$/i }).click();

  await expect(dialog.getByText(SUBJECT)).toBeVisible({ timeout: 10_000 });
});
