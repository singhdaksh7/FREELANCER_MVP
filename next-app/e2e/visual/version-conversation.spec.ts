import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { gotoAndStabilize } from "./utils";
import { makeFixturesDir } from "../file-fixtures";
import { createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink, loginAsCreator } from "./wizard-helpers";

/** Creator Comments tab filtered to a single file version — version-specific conversations stay visually distinct. */
test("version-specific conversation visual baseline", async ({ page, context }, testInfo) => {
  // Fixed (no Date.now()) — the file name is rendered on screen as the
  // selected <select> option text in the captured screenshot area (see
  // approval-only-portal.spec.ts's equivalent comment); a brand-new,
  // uniquely-id'd workspace is created regardless of title text.
  const dir = makeFixturesDir();
  const fileName = `visual-version-conv-${testInfo.project.name}.jpg`;
  const pathV1 = join(dir, fileName);
  writeFileSync(pathV1, await sharp({ create: { width: 700, height: 500, channels: 3, background: { r: 20, g: 40, b: 60 } } }).jpeg().toBuffer());
  const pathV2 = join(dir, `v2-${fileName}`);
  writeFileSync(pathV2, await sharp({ create: { width: 900, height: 650, channels: 3, background: { r: 150, g: 30, b: 30 } } }).jpeg().toBuffer());

  const workspaceUrl = await createWorkspaceViaWizard(page, {
    title: `Visual Version Conversation ${testInfo.project.name}`,
    amount: "5000",
  });
  await uploadFileAndWaitReady(page, workspaceUrl, pathV1);
  const reviewPath = await createReviewLink(page);

  // The comments composer is only reachable via two disjoint viewport
  // affordances — the always-visible <aside> at >=1024px ("lg"), or a
  // "Comments (N)" toggle that opens a bottom-sheet dialog below 640px
  // ("sm") — with a gap in between (e.g. this project's own 768px
  // "tablet-768") where neither is present. Since this spec's screenshot
  // is of the *creator's* Comments tab, not the client portal, the
  // viewport used to post the client comment doesn't need to match the
  // project's own viewport — temporarily use a real mobile width for
  // that step, then restore the project's viewport before continuing.
  const originalViewport = page.viewportSize();
  const isDesktop = testInfo.project.name === "desktop-1440";
  if (!isDesktop) {
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await context.clearCookies();
  await page.goto(reviewPath);

  if (!isDesktop) {
    await page.getByRole("button", { name: /comments \(/i }).click();
  }
  const commentsScope = isDesktop ? page.locator("aside") : page.getByRole("dialog", { name: /comments/i });

  await commentsScope.getByPlaceholder(/enter your name/i).fill("Rohit Sharma");
  await commentsScope.getByPlaceholder(/add a comment/i).fill("Version 1 feedback for the visual baseline");
  await commentsScope.getByRole("button", { name: /^post$/i }).click();
  await expect(commentsScope.getByText("Version 1 feedback for the visual baseline")).toBeVisible();

  if (originalViewport) {
    await page.setViewportSize(originalViewport);
  }

  // context.clearCookies() above wiped the shared creator storageState's
  // session cookie too — a real login is the only way back in.
  await loginAsCreator(page);
  await page.goto(workspaceUrl);
  await page.getByRole("tab", { name: /^files$/i }).click();
  const card = page.locator(`[data-testid="file-card"][data-file-name="${fileName}"]`);
  await card.getByLabel(/upload new version/i).setInputFiles(pathV2);
  // Confirm the upload actually started (a real version-2 candidate
  // exists) before polling for it to clear — otherwise a reload landing
  // before the candidate ever renders would make the poll trivially
  // "succeed" at count 0 without a second version ever having existed.
  await expect(card.getByText(/version 2 candidate/i)).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      async () => {
        await page.reload();
        await page.getByRole("tab", { name: /^files$/i }).click();
        return card.getByText(/version 2 candidate/i).count();
      },
      { timeout: 20_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(0);

  await gotoAndStabilize(page, workspaceUrl);
  await page.getByRole("tab", { name: /^comments$/i }).click();
  await page.getByRole("combobox", { name: /^file$/i }).selectOption({ label: fileName });
  await page.getByRole("combobox", { name: /^version$/i }).selectOption({ label: "v1" });
  await expect(page.getByText("Version 1 feedback for the visual baseline")).toBeVisible();

  await expect(page).toHaveScreenshot("version-conversation.png");
});
