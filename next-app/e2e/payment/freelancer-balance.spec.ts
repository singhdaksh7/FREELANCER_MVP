import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/** Freelancer pending/available/paid-out balance widget on /payments — see creator-balance-card.tsx. */
test("shows the pending, available and paid-out balance sections", async ({ page }) => {
  await login(page);
  await page.goto("/payments");

  await expect(page.getByText("Payable Balance")).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await expect(page.getByText("Paid Out", { exact: true })).toBeVisible();
  await expect(page.getByText(/available after \d+h hold/i)).toBeVisible();
  // Test-mode payout simulation — no real funds are ever transferred in this MVP.
  await expect(page.getByText(/test-mode payout simulation/i)).toBeVisible();
});
