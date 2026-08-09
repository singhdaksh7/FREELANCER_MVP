import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeValidJpegFixture } from "../file-fixtures";
import { createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./wizard-helpers";

/** APPROVAL_ONLY client portal — approve control present, no payment CTA ever renders. */
test("approval-only client portal visual baseline", async ({ page, context }, testInfo) => {
  // Fixed (no Date.now()) — this workspace title and file name both render
  // on screen inside the full-page screenshot below (review-portal.tsx's
  // header and file-switcher chip), so they must stay stable across runs.
  // Safe to hardcode: createWorkspaceViaWizard always creates a brand-new,
  // uniquely-id'd workspace regardless of title text, so there's no
  // collision risk even if this spec runs repeatedly against the same DB.
  // testInfo.project.name still distinguishes the concurrent desktop/
  // tablet/mobile viewport projects from each other.
  const fixturesDir = makeFixturesDir();
  const name = `visual-approval-only-${testInfo.project.name}.jpg`;
  const path = await writeValidJpegFixture(fixturesDir, name);

  const workspaceUrl = await createWorkspaceViaWizard(page, {
    title: `Visual Approval Only ${testInfo.project.name}`,
    deliveryMode: "APPROVAL_ONLY",
  });
  await uploadFileAndWaitReady(page, workspaceUrl, path);
  const reviewPath = await createReviewLink(page);

  await context.clearCookies();
  await gotoAndStabilize(page, reviewPath);
  await expect(page.getByRole("button", { name: /^approve project$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^pay ₹/i })).toHaveCount(0);

  await expect(page).toHaveScreenshot("approval-only-portal.png");
});
