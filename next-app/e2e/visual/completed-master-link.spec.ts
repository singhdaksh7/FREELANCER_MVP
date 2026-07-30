import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeValidJpegFixture } from "../file-fixtures";
import { createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./wizard-helpers";

/** Completed (CLOSED) master review link, rendered read-only — reached via PREVIEW_ONLY + "Close Project" to avoid the external payment gateway. */
test("completed master link read-only visual baseline", async ({ page, context }, testInfo) => {
  const fixturesDir = makeFixturesDir();
  const name = `visual-completed-link-${testInfo.project.name}-${Date.now()}.jpg`;
  const path = await writeValidJpegFixture(fixturesDir, name);

  const workspaceUrl = await createWorkspaceViaWizard(page, {
    title: `Visual Completed Link ${testInfo.project.name} ${Date.now()}`,
    deliveryMode: "PREVIEW_ONLY",
  });
  await uploadFileAndWaitReady(page, workspaceUrl, path);
  const reviewPath = await createReviewLink(page);

  await page.goto(workspaceUrl);
  await page.getByRole("button", { name: /^close project$/i }).click();
  await page.getByRole("button", { name: /yes, close project/i }).click();
  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

  await context.clearCookies();
  await gotoAndStabilize(page, reviewPath);
  await expect(page.getByText(/secure preview/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^request changes$/i })).toHaveCount(0);

  await expect(page).toHaveScreenshot("completed-master-link.png");
});
