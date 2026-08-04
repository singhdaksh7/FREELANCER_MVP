import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeValidJpegFixture } from "../file-fixtures";

/**
 * Phase 6 client review portal visual baselines. Uses the shared
 * (authenticated-as-Arjun) storageState only to create the review link —
 * the review portal itself is opened with no session at all, matching how
 * a real client would reach it. Uploads its own uniquely-named file into
 * ws_brand_identity (element/portal content will reflect whatever else is
 * in that workspace if run concurrently with other suites touching it —
 * see MUTATION_ARCHITECTURE.md's existing "don't run mutations-e2e
 * together with the visual suite" guidance, which applies here too).
 */
async function createReviewLinkAndGetPath(page: import("@playwright/test").Page, testInfo: { project: { name: string } }): Promise<string> {
  const fixturesDir = makeFixturesDir();
  const name = `visual-review-${testInfo.project.name}-${Date.now()}.jpg`;
  const path = await writeValidJpegFixture(fixturesDir, name);

  await gotoAndStabilize(page, "/workspaces/ws_brand_identity");
  await page.getByRole("tab", { name: /^files$/i }).click();
  await page.getByLabel(/choose files to upload/i).setInputFiles(path);
  const card = page.locator(`[data-testid="file-card"][data-file-name="${name}"]`);
  await expect(card.getByText("Ready", { exact: true })).toBeVisible({ timeout: 40_000 });

  const revokeButton = page.getByRole("button", { name: /^revoke link$/i });
  if (await revokeButton.isVisible().catch(() => false)) {
    await revokeButton.click();
    await page.getByRole("button", { name: /^revoke link$/i }).last().click();
    await expect(page.getByRole("button", { name: /create secure review link/i })).toBeVisible();
  }
  await page.getByRole("button", { name: /create secure review link/i }).click();
  const linkInput = page.getByTestId("review-link-input");
  await expect(linkInput).toBeVisible();
  const fullUrl = await linkInput.inputValue();
  return new URL(fullUrl).pathname;
}

test("client review portal — desktop/tablet/mobile visual baseline", async ({ page, context }, testInfo) => {
  const reviewPath = await createReviewLinkAndGetPath(page, testInfo);

  await context.clearCookies();
  await gotoAndStabilize(page, reviewPath);
  await expect(page.getByText(/secure preview/i)).toBeVisible();

  // ws_brand_identity is a shared, never-cleaned workspace (see this file's
  // top doc comment) — every run of this spec permanently adds another
  // file, so the file-switcher's chip list (and therefore its rendered
  // Date.now()-suffixed names) grows/changes across runs. Masked rather
  // than relying on either a fixed name (would collide with prior runs'
  // still-present files) or a full reset of shared seed data.
  await expect(page).toHaveScreenshot("review-portal-main.png", {
    mask: [page.getByTestId("file-switcher")],
  });
});

test("invalid review link visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/review/this-is-not-a-real-token-at-all");
  await expect(page.getByText(/invalid review link/i)).toBeVisible();

  await expect(page).toHaveScreenshot("review-portal-invalid.png");
});

test("mobile comments bottom sheet visual baseline", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Bottom sheet is a mobile-only affordance.");

  const reviewPath = await createReviewLinkAndGetPath(page, testInfo);
  await context.clearCookies();
  await gotoAndStabilize(page, reviewPath);

  await page.getByRole("button", { name: /comments \(/i }).click();
  await expect(page.getByRole("dialog", { name: /comments/i })).toBeVisible();

  await expect(page).toHaveScreenshot("review-portal-mobile-comments-sheet.png");
});
