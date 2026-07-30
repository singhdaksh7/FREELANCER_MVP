import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

// ws_product_pkg, not ws_brand_identity: review-portal.spec.ts uploads
// real files into ws_brand_identity, which raced against this file's
// "files empty state" (and, once files/download activity actually
// existed, the overview/activity tabs too) whenever both ran in the same
// desktop-1440/tablet-768/mobile-390 pass. ws_product_pkg's Files tab is
// never touched by any other visual spec — see files-empty.spec.ts's own
// ws_ecommerce_ui for the same isolation pattern.
const WORKSPACE_PATH = "/workspaces/ws_product_pkg";

test("workspace details (overview tab) visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, WORKSPACE_PATH);
  await expect(page).toHaveScreenshot("workspace-details-overview.png");
});

test("workspace details files empty state visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^files$/i }).click();
  await expect(page.getByText(/no files uploaded yet/i)).toBeVisible();
  await expect(page).toHaveScreenshot("workspace-details-files.png");
});

test("workspace details activity tab visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, WORKSPACE_PATH);
  await page.getByRole("tab", { name: /^activity$/i }).click();
  await expect(page.getByText(/files unlocked for download/i)).toBeVisible();
  await expect(page).toHaveScreenshot("workspace-details-activity.png");
});
