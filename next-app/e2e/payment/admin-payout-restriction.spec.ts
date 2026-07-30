import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/** Test-mode payout simulation controls are reachable only by an ADMIN session — see ADMIN_ARCHITECTURE.md. */
test("admin sees the payout simulation controls at /admin/payouts", async ({ page }) => {
  await login(page, "admin@example.com", "Demo@12345");
  await page.goto("/admin/payouts");

  await expect(page.getByRole("heading", { name: /payout ledger/i })).toBeVisible();
  await expect(page.getByText(/test-mode payout simulation/i)).toBeVisible();
});

test("a creator session is denied at /admin/payouts, never reaching the simulation controls", async ({ page }) => {
  await login(page); // seeded CREATOR (arjun@example.com)
  await page.goto("/admin/payouts");

  await expect(page).toHaveURL(/\/permission-denied$/);
  await expect(page.getByRole("button", { name: /mark available|start payout|complete payout|retry payout/i })).toHaveCount(0);
});
