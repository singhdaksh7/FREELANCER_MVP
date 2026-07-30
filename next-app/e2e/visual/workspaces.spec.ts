import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("workspaces visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces");
  await expect(page).toHaveScreenshot("workspaces.png");
});
