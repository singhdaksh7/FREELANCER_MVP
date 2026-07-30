import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("notifications visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/notifications");
  await expect(page).toHaveScreenshot("notifications.png");
});
