import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink, approveAsClient } from "./helpers";

/**
 * PAYMENT_REQUIRED workspace creation and the client review-portal's
 * Approve -> Pay CTA. The e2e webServer runs a real `next build && next
 * start` (NODE_ENV=production), and src/payments/payment-config.ts
 * deliberately refuses PAYMENT_PROVIDER="fake" (and any Razorpay test-mode
 * key) once NODE_ENV=production — there is no supported way to fake a
 * successful capture in this environment, by design. So this test
 * verifies the CTA renders and that clicking it surfaces the safe,
 * graceful "Payment failed / no charge was made" state rather than a
 * crash or a silently-faked success — real capture requires live
 * Razorpay credentials and is out of scope for E2E.
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `Playwright Payment Required ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let filePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-payment-e2e-"));
  filePath = await writeValidJpegFixture(dir, `payment-required-${RUN_ID}.jpg`);
});

test("creates a PAYMENT_REQUIRED workspace with an amount and generates a review link", async ({ page }) => {
  // See e2e/requirements-alignment/approval-only.spec.ts's equivalent
  // comment: real upload/worker processing plus a review-link Server
  // Action needs more than the default 30s test timeout.
  test.setTimeout(120_000);
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, {
    title: WORKSPACE_TITLE,
    amount: "12000",
    deliveryMode: "PAYMENT_REQUIRED",
  });
  await expect(page.getByRole("heading", { name: WORKSPACE_TITLE })).toBeVisible();

  await uploadFileAndWaitReady(page, workspaceUrl, filePath);
  reviewLinkUrl = await createReviewLink(page);
  expect(reviewLinkUrl).toMatch(/\/review\/[A-Za-z0-9_-]{40,}$/);
});

test("client approves and sees the Pay CTA, which fails safely (no fake/test-mode gateway in this build)", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(reviewLinkUrl);

  await approveAsClient(page);

  const payButton = page.getByRole("button", { name: /^pay ₹/i });
  await expect(payButton).toBeVisible();

  const orderResponse = page.waitForResponse((response) => response.url().includes("/payments/orders") && response.request().method() === "POST");
  await payButton.click();
  const response = await orderResponse;
  expect(response.ok()).toBe(false);

  await expect(page.getByText(/payment failed/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^try again$/i })).toBeVisible();
});
