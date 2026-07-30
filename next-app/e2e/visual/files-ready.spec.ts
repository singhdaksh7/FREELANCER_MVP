import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeValidJpegFixture } from "../file-fixtures";

/**
 * Element-scoped (not full-page) screenshot: this spec uploads a real
 * file into a shared workspace that the desktop/tablet/mobile viewport
 * projects all exercise concurrently, so the surrounding file list can
 * legitimately contain other in-flight uploads from sibling projects at
 * the same moment. Scoping the screenshot to just this test's own file
 * card (a unique, run-specific filename) keeps the baseline deterministic
 * regardless of what else is in the list.
 */
test("file card — Ready / preview-available state visual baseline", async ({ page }, testInfo) => {
  const fixturesDir = makeFixturesDir();
  const name = `visual-ready-${testInfo.project.name}-${Date.now()}.jpg`;
  const path = await writeValidJpegFixture(fixturesDir, name);

  await gotoAndStabilize(page, "/workspaces/ws_social_campaign");
  await page.getByRole("tab", { name: /^files$/i }).click();
  await page.getByLabel(/choose files to upload/i).setInputFiles(path);

  const card = page.locator(`[data-testid="file-card"][data-file-name="${name}"]`);
  await expect(card.getByText("Ready", { exact: true })).toBeVisible({ timeout: 40_000 });
  await card.getByRole("button", { name: /view protected preview/i }).click();
  await expect(card.getByRole("img")).toBeVisible();

  await expect(card).toHaveScreenshot("file-card-ready.png");
});
