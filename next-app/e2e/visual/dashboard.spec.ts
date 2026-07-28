import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("dashboard visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/dashboard");
  // Viewport (not fullPage): the shell's fixed sidebar/bottom-nav get
  // duplicated by Playwright's full-page stitching otherwise, and a
  // single viewport already shows the complete visible page.
  await expect(page).toHaveScreenshot("dashboard.png");
});
