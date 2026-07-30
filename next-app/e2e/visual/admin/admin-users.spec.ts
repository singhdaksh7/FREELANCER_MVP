import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "../utils";

test("admin users visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/admin/users");
  await expect(page.getByRole("heading", { name: /^creators$/i })).toBeVisible();

  await expect(page).toHaveScreenshot("admin-users.png");
});
