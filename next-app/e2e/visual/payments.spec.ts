import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("payments visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/payments");
  await expect(page).toHaveScreenshot("payments.png");
});
