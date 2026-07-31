import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

/** Phase 8 — workspace edit form, with the plain "Client Name" textbox replacing the saved-Client selector. Uses the seeded, non-locked ws_social_campaign (DRAFT) workspace. */
test("workspace edit visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/ws_social_campaign/edit");
  await expect(page).toHaveScreenshot("workspace-edit.png");
});
