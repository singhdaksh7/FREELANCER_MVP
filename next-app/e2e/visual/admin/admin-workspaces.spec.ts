import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "../utils";

test("admin workspaces visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/admin/workspaces");
  await expect(page.getByRole("heading", { name: /^workspaces$/i })).toBeVisible();

  await expect(page).toHaveScreenshot("admin-workspaces.png");
});
