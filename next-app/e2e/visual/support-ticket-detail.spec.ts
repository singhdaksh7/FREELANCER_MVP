import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

/** Creator's own support-ticket detail page — see src/app/(creator)/support/[id]/page.tsx. */
test("support ticket detail visual baseline", async ({ page }, testInfo) => {
  const subject = `Visual Support Ticket ${testInfo.project.name} ${Date.now()}`;

  await gotoAndStabilize(page, "/support/new");
  await page.getByLabel(/category/i).selectOption({ label: "Payment" });
  await page.getByLabel(/subject/i).fill(subject);
  await page.getByLabel(/description/i).fill(`Description for ${subject}`);
  await page.getByRole("button", { name: /^create ticket$/i }).click();

  await page.waitForURL(/\/support\/(?!new$)[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();

  await gotoAndStabilize(page, page.url().replace(/^https?:\/\/[^/]+/, ""));
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();

  await expect(page).toHaveScreenshot("support-ticket-detail.png");
});
