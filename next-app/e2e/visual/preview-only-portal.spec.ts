import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeValidJpegFixture } from "../file-fixtures";
import { createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./wizard-helpers";

/** PREVIEW_ONLY client portal — no approve, payment, or download control ever renders. */
test("preview-only client portal visual baseline", async ({ page, context }, testInfo) => {
  const fixturesDir = makeFixturesDir();
  const name = `visual-preview-only-${testInfo.project.name}-${Date.now()}.jpg`;
  const path = await writeValidJpegFixture(fixturesDir, name);

  const workspaceUrl = await createWorkspaceViaWizard(page, {
    title: `Visual Preview Only ${testInfo.project.name} ${Date.now()}`,
    deliveryMode: "PREVIEW_ONLY",
  });
  await uploadFileAndWaitReady(page, workspaceUrl, path);
  const reviewPath = await createReviewLink(page);

  await context.clearCookies();
  await gotoAndStabilize(page, reviewPath);
  await expect(page.getByText(/secure preview/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^approve project$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /pay and unlock files/i })).toHaveCount(0);

  await expect(page).toHaveScreenshot("preview-only-portal.png");
});
