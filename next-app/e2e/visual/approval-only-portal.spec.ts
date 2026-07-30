import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeValidJpegFixture } from "../file-fixtures";
import { createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./wizard-helpers";

/** APPROVAL_ONLY client portal — approve control present, no payment CTA ever renders. */
test("approval-only client portal visual baseline", async ({ page, context }, testInfo) => {
  const fixturesDir = makeFixturesDir();
  const name = `visual-approval-only-${testInfo.project.name}-${Date.now()}.jpg`;
  const path = await writeValidJpegFixture(fixturesDir, name);

  const workspaceUrl = await createWorkspaceViaWizard(page, {
    title: `Visual Approval Only ${testInfo.project.name} ${Date.now()}`,
    deliveryMode: "APPROVAL_ONLY",
  });
  await uploadFileAndWaitReady(page, workspaceUrl, path);
  const reviewPath = await createReviewLink(page);

  await context.clearCookies();
  await gotoAndStabilize(page, reviewPath);
  await expect(page.getByRole("button", { name: /^approve project$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /pay and unlock files/i })).toHaveCount(0);

  await expect(page).toHaveScreenshot("approval-only-portal.png");
});
