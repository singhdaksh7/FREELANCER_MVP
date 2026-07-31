import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

/** Wizard step 4's delivery-mode selector (PAYMENT_REQUIRED / APPROVAL_ONLY — PREVIEW_ONLY was retired in Phase 8, see DELIVERY_MODES.md) — pure client-side navigation, no draft is ever created. */
test("delivery mode selector visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/workspaces/new");
  await page.getByLabel(/^title/i).fill("Visual Baseline Delivery Mode");
  await page.getByLabel(/client name/i).fill("Visual Baseline Client");
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 2
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 3
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 4

  await expect(page.getByRole("radio", { name: /payment required/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /approval only/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /preview only/i })).toHaveCount(0);

  await expect(page).toHaveScreenshot("delivery-mode-selector.png");
});
