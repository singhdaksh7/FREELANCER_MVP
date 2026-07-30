import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "../utils";

test("admin payments visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/admin/payments");
  await expect(page.getByRole("heading", { name: /^payments$/i })).toBeVisible();

  await expect(page).toHaveScreenshot("admin-payments.png");
});
