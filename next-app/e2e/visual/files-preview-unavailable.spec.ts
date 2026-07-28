import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeMinimalPdfFixture } from "../file-fixtures";

/** Element-scoped screenshot — see files-ready.spec.ts's doc comment for why. */
test("file card — locked / Preview Not Available (PDF) visual baseline", async ({ page }, testInfo) => {
  const fixturesDir = makeFixturesDir();
  const name = `visual-locked-${testInfo.project.name}-${Date.now()}.pdf`;
  const path = writeMinimalPdfFixture(fixturesDir, name);

  await gotoAndStabilize(page, "/workspaces/ws_social_campaign");
  await page.getByRole("tab", { name: /^files$/i }).click();
  await page.getByLabel(/choose files to upload/i).setInputFiles(path);

  const card = page.locator(`[data-testid="file-card"][data-file-name="${name}"]`);
  await expect(card.getByText("Ready", { exact: true })).toBeVisible({ timeout: 40_000 });
  await expect(card.getByText(/preview not available/i)).toBeVisible();

  await expect(card).toHaveScreenshot("file-card-preview-unavailable.png");
});
