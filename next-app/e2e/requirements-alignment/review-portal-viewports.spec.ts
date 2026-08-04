import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./helpers";

/**
 * Functional (not just visual-screenshot) coverage of the client review
 * portal across the required device sizes — thumbnail rail, protected
 * preview loading, no page-level horizontal overflow, and (below the `lg`
 * breakpoint) that approval/release/download actions stay reachable via
 * the mobile "Actions" sheet instead of the desktop-only sidebar. See
 * review-portal.tsx's `mobileActionsOpen` sheet.
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA Viewport Coverage ${RUN_ID}`;

let reviewLinkUrl = "";
let filePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-viewports-"));
  filePath = await writeValidJpegFixture(dir, `viewport-${RUN_ID}.jpg`);
});

test("creates a workspace with a review link for viewport coverage", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, deliveryMode: "APPROVAL_ONLY" });
  await uploadFileAndWaitReady(page, workspaceUrl, filePath);
  reviewLinkUrl = await createReviewLink(page);
});

const VIEWPORTS: { name: string; width: number; height: number; mobile: boolean }[] = [
  { name: "375x667", width: 375, height: 667, mobile: true },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "768x1024", width: 768, height: 1024, mobile: true }, // below the `lg` (1024px) breakpoint — still gets the mobile action sheet
  { name: "1366x768", width: 1366, height: 768, mobile: false },
  { name: "1440x900", width: 1440, height: 900, mobile: false },
];

for (const viewport of VIEWPORTS) {
  test(`review portal at ${viewport.name}: preview loads, no horizontal overflow, actions reachable`, async ({ page, context }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(reviewLinkUrl);

    // Thumbnail rail is present and the file auto-loads its preview without
    // any manual click.
    await expect(page.getByTestId("file-switcher")).toBeVisible();
    await expect(page.getByRole("img", { name: /protected preview of/i })).toBeVisible({ timeout: 15_000 });

    // No page-level horizontal scroll at this viewport.
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowX).toBeLessThanOrEqual(1);

    if (viewport.mobile) {
      // Desktop-only sidebar is hidden; actions are reached via the mobile sheet.
      const actionsButton = page.getByRole("button", { name: /^actions$/i });
      await expect(actionsButton).toBeVisible();
      const box = await actionsButton.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

      await actionsButton.click();
      await expect(page.getByRole("dialog", { name: /actions/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^approve project$/i })).toBeVisible();
    } else {
      // Desktop sidebar's Action Center is directly visible, no sheet needed.
      await expect(page.getByRole("button", { name: /^approve project$/i })).toBeVisible();
    }
  });
}
