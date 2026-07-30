import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * A non-admin (authenticated CREATOR) session is denied at every admin
 * route — see ADMIN_ARCHITECTURE.md "Role gate." The layout's
 * requireAdminRole() redirects to /permission-denied, a safe denial page
 * rather than a 403/500 or a leak of admin content.
 */
const ADMIN_ROUTES = ["/admin", "/admin/users", "/admin/workspaces", "/admin/payments", "/admin/payouts", "/admin/support"];

for (const route of ADMIN_ROUTES) {
  test(`creator session is redirected to /permission-denied for ${route}`, async ({ page }) => {
    await login(page);
    await page.goto(route);
    await expect(page).toHaveURL(/\/permission-denied$/);
  });
}
