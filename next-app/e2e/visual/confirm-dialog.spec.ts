import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("delete-client confirmation dialog visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/clients");
  await page.getByRole("button", { name: /^delete$/i }).first().click();

  await expect(page.getByRole("heading", { name: /^delete .+\?$/i })).toBeVisible();
  await expect(page).toHaveScreenshot("confirm-dialog-delete-client.png");
});
