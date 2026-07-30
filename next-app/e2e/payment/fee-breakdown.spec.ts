import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * 2% platform-fee breakdown on the creator's Payment tab — uses the
 * seeded ws_product_pkg / pay_101 payment, which now carries a
 * deterministic PaymentBreakdown row (prisma/seed.ts) so this doesn't
 * depend on completing a full order-creation -> webhook capture pipeline.
 */
test("shows the platform-fee breakdown for a captured payment", async ({ page }) => {
  await login(page);
  await page.goto("/workspaces/ws_product_pkg");
  await page.getByRole("tab", { name: /^payment$/i }).click();

  await expect(page.getByText("Platform Fee (2.00%)")).toBeVisible();
  await expect(page.getByText("Gross Amount")).toBeVisible();
  await expect(page.getByText("Your Payout")).toBeVisible();
  await expect(page.getByText("₹600").first()).toBeVisible();
  await expect(page.getByText("₹29,400").first()).toBeVisible();
});
