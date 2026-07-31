import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Phase 8 removed INLAY's platform fee entirely — freelancers keep 100%
 * of every payment (see PLATFORM_FEE_AND_PAYOUT_LEDGER.md). The
 * creator's Payment tab for the seeded ws_product_pkg / pay_101 payment
 * (prisma/seed.ts, now a zero-fee PaymentBreakdown) must show a single
 * Amount, never a separate Gross/Platform Fee/Payout breakdown.
 */
test("shows a single Amount for a captured payment, with no platform-fee breakdown", async ({ page }) => {
  await login(page);
  await page.goto("/workspaces/ws_product_pkg");
  await page.getByRole("tab", { name: /^payment$/i }).click();

  await expect(page.getByText(/platform fee/i)).toHaveCount(0);
  await expect(page.getByText("Gross Amount")).toHaveCount(0);
  await expect(page.getByText("Your Payout")).toHaveCount(0);
  await expect(page.getByText("₹30,000").first()).toBeVisible();
});
