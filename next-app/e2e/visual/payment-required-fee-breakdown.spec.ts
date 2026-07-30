import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

/** Platform-fee breakdown on the Payment tab — uses the seeded ws_product_pkg / pay_101 payment's deterministic PaymentBreakdown (see prisma/seed.ts). */
test("payment-required platform-fee breakdown visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/ws_product_pkg");
  await page.getByRole("tab", { name: /^payment$/i }).click();
  await expect(page.getByText("Platform Fee (2.00%)")).toBeVisible();

  await expect(page).toHaveScreenshot("payment-required-fee-breakdown.png");
});
