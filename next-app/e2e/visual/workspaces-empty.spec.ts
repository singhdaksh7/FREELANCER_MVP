import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("workspaces no-results empty-state visual baseline", async ({ page }) => {
  // A search term guaranteed not to match any seeded workspace — a
  // deterministic way to reach the empty state without needing a
  // separate zero-data creator account.
  await gotoAndStabilize(page, "/workspaces?q=zzz-no-such-workspace-zzz");

  await expect(page.getByText(/no workspaces match your search/i)).toBeVisible();
  await expect(page).toHaveScreenshot("workspaces-empty.png");
});
