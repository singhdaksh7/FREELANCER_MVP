import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

/** Wizard's inline "Add New Client" modal, opened but not submitted — no client is created. */
test("inline add-client modal visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/new");
  await page.getByRole("button", { name: /add new client/i }).click();
  const dialog = page.getByRole("dialog", { name: /add new client/i });
  await expect(dialog).toBeVisible();

  await expect(page).toHaveScreenshot("inline-add-client.png");
});
