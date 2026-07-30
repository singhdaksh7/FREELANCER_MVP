import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "../utils";

test("admin dashboard visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/admin");
  await expect(page.getByText("Project Vault Admin")).toBeVisible();

  await expect(page).toHaveScreenshot("admin-dashboard.png");
});
