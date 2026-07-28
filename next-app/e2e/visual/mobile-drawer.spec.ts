import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("mobile navigation drawer open-state visual baseline", async ({ page }, testInfo) => {
  // The hamburger/drawer only exists in the mobile layout (<769px per the
  // corrected breakpoint — see globals.css); the desktop-1440 project
  // shows the persistent sidebar instead, so there's nothing to open there.
  test.skip(testInfo.project.name === "desktop-1440", "Drawer only exists in the mobile layout.");

  await gotoAndStabilize(page, "/dashboard");
  await page.getByRole("button", { name: /open navigation menu/i }).click();

  await expect(page.getByRole("dialog", { name: /creator navigation/i })).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-drawer-open.png");
});
