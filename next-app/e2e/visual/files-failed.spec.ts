import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeOversizedDimensionJpegFixture } from "../file-fixtures";

/** Element-scoped screenshot — see files-ready.spec.ts's doc comment for why. */
test("file card — Processing Failed state visual baseline", async ({ page }, testInfo) => {
  const fixturesDir = makeFixturesDir();
  const name = `visual-failed-${testInfo.project.name}-${Date.now()}.jpg`;
  const path = await writeOversizedDimensionJpegFixture(fixturesDir, name);

  await gotoAndStabilize(page, "/workspaces/ws_social_campaign");
  await page.getByRole("tab", { name: /^files$/i }).click();
  await page.getByLabel(/choose files to upload/i).setInputFiles(path);

  const card = page.locator(`[data-testid="file-card"][data-file-name="${name}"]`);
  await expect(card.getByText("Failed", { exact: true })).toBeVisible({ timeout: 40_000 });

  await expect(card).toHaveScreenshot("file-card-failed.png");
});
