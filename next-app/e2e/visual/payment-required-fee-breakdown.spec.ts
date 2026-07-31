import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

/** Payment tab visual baseline — Phase 8 removed the platform-fee breakdown entirely (see PLATFORM_FEE_AND_PAYOUT_LEDGER.md); this now shows a single Amount for the seeded ws_product_pkg / pay_101 payment. */
test("payment-required amount visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/ws_product_pkg");
  await page.getByRole("tab", { name: /^payment$/i }).click();
  await expect(page.getByText(/platform fee/i)).toHaveCount(0);

  await expect(page).toHaveScreenshot("payment-required-fee-breakdown.png");
});
