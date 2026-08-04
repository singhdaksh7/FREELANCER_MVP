import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "e2e/visual/.auth/creator.json";

/**
 * Runs once before the visual (screenshot) projects. Logs in as the
 * seeded demo creator through the real UI (not a fabricated cookie) and
 * saves the resulting session as reusable storage state, so the
 * dashboard/workspaces/payments/notifications screenshot tests don't
 * each have to repeat the login flow.
 */
setup("authenticate as the demo creator", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill("arjun@example.com");
  await page.getByLabel(/^password$/i).fill("Demo@12345");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Good (morning|afternoon|evening), Arjun Raj/);

  await page.context().storageState({ path: AUTH_FILE });
});
