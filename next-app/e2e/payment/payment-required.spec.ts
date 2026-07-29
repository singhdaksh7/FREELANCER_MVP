import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import {
  login,
  createWorkspaceViaWizard,
  uploadFileAndWaitReady,
  createReviewLink,
  approveAsClient,
  stubRazorpayCheckout,
} from "./helpers";

/**
 * PAYMENT_REQUIRED workspace creation and the client review-portal's
 * Approve -> Pay CTA. Stops short of a real Razorpay capture (external
 * gateway, non-deterministic in CI) — see helpers.ts's stubRazorpayCheckout
 * doc comment.
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

test("client approves and sees the Pay CTA, which starts a real order-creation call", async ({ page, context }) => {
  await context.clearCookies();
  await stubRazorpayCheckout(page);
  await page.goto(reviewLinkUrl);

  await approveAsClient(page);

  const payButton = page.getByRole("button", { name: /pay and unlock files/i });
  await expect(payButton).toBeVisible();

  const orderResponse = page.waitForResponse((response) => response.url().includes("/payments/orders") && response.request().method() === "POST");
  await payButton.click();
  const response = await orderResponse;
  expect(response.ok()).toBe(true);

  await expect(page.getByText(/waiting for checkout/i)).toBeVisible({ timeout: 10_000 });
});
