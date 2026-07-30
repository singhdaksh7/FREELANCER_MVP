import { test as setup, expect } from "@playwright/test";

const ADMIN_AUTH_FILE = "e2e/visual/.auth/admin.json";

/**
 * Runs once before the admin visual (screenshot) projects. Logs in as the
 * seeded demo ADMIN account through the real UI and saves the resulting
 * session as reusable storage state — separate from the creator
 * storageState (e2e/visual/.auth/creator.json) since /admin/* requires the
 * ADMIN role and a creator session must never reach it (see
 * ADMIN_ARCHITECTURE.md).
 */
setup("authenticate as the demo admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill("admin@example.com");
  await page.getByLabel(/^password$/i).fill("Demo@12345");
  await page.getByRole("button", { name: /sign in/i }).click();

  // Login always redirects to /dashboard regardless of role (src/actions/auth.ts) —
  // admins have no creator dashboard of their own, so navigate to /admin explicitly.
  await page.waitForURL(/\/dashboard$/);
  await page.goto("/admin");
  await expect(page.getByText("INLAY Administration")).toBeVisible();

  await page.context().storageState({ path: ADMIN_AUTH_FILE });
});
