import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("create workspace step 1 (project details) visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/new");
  await expect(page).toHaveScreenshot("workspace-new-step1.png");
});

test("create workspace review step visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/new");

  await page.getByLabel(/^title/i).fill("Visual Baseline Workspace");
  await page.getByLabel(/client name/i).fill("Visual Baseline Client");
  await page.getByRole("button", { name: /^continue$/i }).click(); // step 2
  await page.getByRole("button", { name: /^continue$/i }).click(); // step 3
  await page.getByRole("button", { name: /^continue$/i }).click(); // step 4
  await page.getByLabel(/^amount/i).fill("15000");
  await page.getByRole("button", { name: /^continue$/i }).click(); // step 5

  await expect(page.locator("legend", { hasText: /review & create/i })).toBeVisible();
  await expect(page).toHaveScreenshot("workspace-new-review.png");
});
