import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

// ws_ecommerce_ui is never touched by e2e/uploads or e2e/mutations —
// it's a stable "zero files" workspace for this baseline.
test("files tab empty state visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/ws_ecommerce_ui");
  await page.getByRole("tab", { name: /^files$/i }).click();
  await expect(page.getByText(/no files uploaded yet/i)).toBeVisible();
  await expect(page).toHaveScreenshot("files-empty.png");
});
