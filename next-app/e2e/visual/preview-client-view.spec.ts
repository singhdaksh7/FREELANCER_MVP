import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

/**
 * Phase 8 — creator-authenticated "Preview Client View"
 * (/workspaces/[id]/preview), showing the "Preview mode" banner and the
 * same empty-files state a client would see for a workspace with no
 * submitted files yet. Uses the seeded ws_social_campaign (DRAFT, no
 * files) so this baseline never depends on an upload/worker step.
 */
test("preview client view visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/ws_social_campaign/preview");
  await expect(page.getByText(/preview mode/i)).toBeVisible();
  await expect(page).toHaveScreenshot("preview-client-view.png");
});
