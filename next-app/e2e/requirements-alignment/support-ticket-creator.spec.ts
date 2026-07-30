import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/** Creator support-ticket creation — see support-ticket-form.tsx / SUPPORT_AND_DISPUTE_ARCHITECTURE.md. */
const RUN_ID = Date.now();
const SUBJECT = `RA Creator Ticket ${RUN_ID}`;

test("creator creates a support ticket and lands on its detail page", async ({ page }) => {
  await login(page);
  await page.goto("/support/new");

  await page.getByLabel(/category/i).selectOption({ label: "Payment" });
  await page.getByLabel(/subject/i).fill(SUBJECT);
  await page.getByLabel(/description/i).fill(`Description for ${SUBJECT}`);
  await page.getByRole("button", { name: /^create ticket$/i }).click();

  await page.waitForURL(/\/support\/(?!new$)[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: SUBJECT })).toBeVisible();
  await expect(page.getByText(`Description for ${SUBJECT}`)).toBeVisible();
});
