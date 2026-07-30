import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

/** Freelancer pending/available/paid-out balance card, element-scoped so it stays stable independent of the rest of /payments (already covered by payments.spec.ts). */
test("creator payout balance card visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/payments");
  const card = page.getByTestId("creator-balance-card");
  await expect(card).toBeVisible();

  await expect(card).toHaveScreenshot("creator-payout-balance.png");
});
