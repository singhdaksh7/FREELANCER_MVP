import type { Locator, Page } from "@playwright/test";

export const DEMO_EMAIL = "arjun@example.com";
export const DEMO_PASSWORD = "Demo@12345";

export async function login(page: Page, email = DEMO_EMAIL, password = DEMO_PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard$/);
}

/**
 * Clicks an element that triggers navigation (a Next.js `<Link>`, or a
 * Server Action's `redirect()`), without awaiting the click itself.
 * Awaiting `.click()` directly here is flaky: Playwright's click tracking
 * treats the navigation it causes as an interruption and keeps retrying
 * against the destination page (where the original element no longer
 * exists) until the outer test timeout — even though the click already
 * fully succeeded. `waitForURL` is the real completion signal.
 */
export async function clickAndWaitForURL(page: Page, locator: Locator, urlPattern: RegExp): Promise<void> {
  void locator.click().catch(() => {});
  await page.waitForURL(urlPattern);
}
