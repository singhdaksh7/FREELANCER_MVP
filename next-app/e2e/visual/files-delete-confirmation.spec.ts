import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeValidJpegFixture } from "../file-fixtures";

/**
 * Full-page screenshot (unlike the other new Files-tab baselines): the
 * confirm dialog is a native `<dialog>` shown via `showModal()`, which
 * covers the rest of the page (plus its own `::backdrop`) regardless of
 * what else is in the file list at that moment — so this stays
 * deterministic even with concurrent sibling-project uploads in the
 * background, the same guarantee e2e/visual/confirm-dialog.spec.ts
 * already relies on for the client-delete dialog.
 */
test("file delete confirmation dialog visual baseline", async ({ page }, testInfo) => {
  const fixturesDir = makeFixturesDir();
  const name = `visual-delete-confirm-${testInfo.project.name}-${Date.now()}.jpg`;
  const path = await writeValidJpegFixture(fixturesDir, name);

  await gotoAndStabilize(page, "/workspaces/ws_social_campaign");
  await page.getByRole("tab", { name: /^files$/i }).click();
  await page.getByLabel(/choose files to upload/i).setInputFiles(path);

  const card = page.locator(`[data-testid="file-card"][data-file-name="${name}"]`);
  await expect(card).toBeVisible({ timeout: 40_000 });
  await card.getByRole("button", { name: /^remove$/i }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`remove ${name.replace(".", "\\.")}\\?`, "i") })).toBeVisible();

  await expect(page).toHaveScreenshot("files-delete-confirmation.png");
});
