import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

/** Phase 8 — Settings page, including the new Support section (payout card + support contact card, no ticket form). */
test("settings visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/settings");
  await expect(page).toHaveScreenshot("settings.png");
});
