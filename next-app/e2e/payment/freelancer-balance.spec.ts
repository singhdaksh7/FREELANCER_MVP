import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/** Freelancer pending/available/paid-out balance widget on /payments — see creator-balance-card.tsx. */
test("shows the pending, available and paid-out balance sections", async ({ page }) => {
  await login(page);
  await page.goto("/payments");

  const card = page.getByTestId("creator-balance-card");
  await expect(card.getByText("Payable Balance")).toBeVisible();
  await expect(card.getByText("Pending", { exact: true })).toBeVisible();
  await expect(card.getByText("Available", { exact: true })).toBeVisible();
  await expect(card.getByText("Paid Out", { exact: true })).toBeVisible();
  await expect(card.getByText(/available after \d+h hold/i)).toBeVisible();
  // Test-mode payout simulation — no real funds are ever transferred in this MVP.
  await expect(card.getByText(/test-mode payout simulation/i)).toBeVisible();
});
