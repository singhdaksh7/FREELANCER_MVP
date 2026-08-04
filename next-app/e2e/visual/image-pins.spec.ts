import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir, writeValidJpegFixture } from "../file-fixtures";
import { createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./wizard-helpers";

/** Numbered image pins on the client review portal — see pin-overlay.tsx. */
test("numbered image pins visual baseline", async ({ page, context }, testInfo) => {
  // Fixed (no Date.now()) — see approval-only-portal.spec.ts's equivalent
  // comment: this file name renders on screen (file-switcher chip) and a
  // brand-new, uniquely-id'd workspace is created regardless of title text.
  const fixturesDir = makeFixturesDir();
  const name = `visual-pins-${testInfo.project.name}.jpg`;
  const path = await writeValidJpegFixture(fixturesDir, name);

  const workspaceUrl = await createWorkspaceViaWizard(page, {
    title: `Visual Image Pins ${testInfo.project.name}`,
    amount: "5000",
  });
  await uploadFileAndWaitReady(page, workspaceUrl, path);
  const reviewPath = await createReviewLink(page);

  await context.clearCookies();
  await page.goto(reviewPath);
  await page.getByRole("button", { name: /^add pin$/i }).click();
  await page.locator('div[role="presentation"]').click({ position: { x: 100, y: 80 } });
  // The desktop <aside> and the mobile comments dialog both render their
  // own copy of this composer (one CSS-hidden depending on viewport,
  // never removed from the DOM) — filter to the one actually visible so
  // this spec works unmodified across all three viewport projects.
  await page.locator('input[placeholder="Enter your name"]:visible').fill("Rohit Sharma");
  await page.locator('input[placeholder="Describe this pin…"]:visible').fill("Visual baseline pin comment");
  await page.getByRole("button", { name: /^post$/i }).click();
  await expect(page.getByRole("button", { name: /^Pin 1:/ })).toBeVisible({ timeout: 10_000 });

  await gotoAndStabilize(page, reviewPath);
  await expect(page.getByRole("button", { name: /^Pin 1:/ })).toBeVisible();

  await expect(page).toHaveScreenshot("image-pins.png");
});
