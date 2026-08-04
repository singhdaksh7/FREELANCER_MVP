import { expect, test } from "@playwright/test";
import { makeFixturesDir, writeValidJpegFixture } from "../file-fixtures";
import { stubRemoteImages } from "./utils";
import { createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./wizard-helpers";

/** Doodle/freehand annotation mode open on the client review portal — see annotation-canvas.tsx. */
test("annotation mode visual baseline", async ({ page, context }, testInfo) => {
  // Fixed (no Date.now()) — see approval-only-portal.spec.ts's equivalent
  // comment: this file name renders on screen (file-switcher chip) and a
  // brand-new, uniquely-id'd workspace is created regardless of title text.
  const fixturesDir = makeFixturesDir();
  const name = `visual-annotate-${testInfo.project.name}.jpg`;
  const path = await writeValidJpegFixture(fixturesDir, name);

  const workspaceUrl = await createWorkspaceViaWizard(page, {
    title: `Visual Annotation Mode ${testInfo.project.name}`,
    amount: "5000",
  });
  await uploadFileAndWaitReady(page, workspaceUrl, path);
  const reviewPath = await createReviewLink(page);

  await context.clearCookies();
  await stubRemoteImages(page);
  await page.goto(reviewPath, { waitUntil: "load" });
  await page.getByRole("button", { name: /^annotate$/i }).click();
  await expect(page.getByRole("button", { name: /^freehand$/i })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("annotation-mode.png");
});
