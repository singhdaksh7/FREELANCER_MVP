import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("workspace details (overview tab) visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/ws_brand_identity");
  await expect(page).toHaveScreenshot("workspace-details-overview.png");
});

test("workspace details files empty state visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/ws_brand_identity");
  await page.getByRole("tab", { name: /^files$/i }).click();
  await expect(page.getByText(/no files uploaded yet/i)).toBeVisible();
  await expect(page).toHaveScreenshot("workspace-details-files.png");
});

test("workspace details activity tab visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/ws_brand_identity");
  await page.getByRole("tab", { name: /^activity$/i }).click();
  await expect(page.getByText(/uploaded version 2 files/i)).toBeVisible();
  await expect(page).toHaveScreenshot("workspace-details-activity.png");
});
