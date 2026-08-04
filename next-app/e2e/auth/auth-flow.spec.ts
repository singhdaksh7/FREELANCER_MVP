import { test, expect } from "@playwright/test";

/**
 * Functional (non-screenshot) coverage of the real authentication flow,
 * against the real seeded database — no mocking. Each test manages its
 * own session state via the actual UI rather than reusing the visual
 * suite's shared storageState, since these tests are specifically about
 * login/logout/redirect behavior.
 *
 * Run serially: all tests in this file hit one shared dev server process
 * (Playwright's webServer starts a single instance). Running several
 * concurrent login/logout flows against it was flaky under load in this
 * environment even though the underlying mechanism is correct (verified
 * independently against the real DB and via direct REST calls) — this
 * is a test-concurrency accommodation, not evidence of a product bug.
 */
test.describe.configure({ mode: "serial" });

const DEMO_EMAIL = "arjun@example.com";
const DEMO_PASSWORD = "Demo@12345";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test("unauthenticated visitors are redirected from /dashboard to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("a valid demo login reaches /dashboard", async ({ page }) => {
  await login(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Good (morning|afternoon|evening),/);
});

test("an invalid login shows a generic error and does not reach the dashboard", async ({ page }) => {
  await login(page, DEMO_EMAIL, "definitely-the-wrong-password");

  await expect(page).toHaveURL(/\/login/);
  // Scoped to the form's own error banner — Next.js also renders its
  // internal route-announcer with role="alert", which would otherwise
  // make this locator ambiguous.
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("logout ends the session and returns to the public/login experience", async ({ page }) => {
  await login(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: /log out/i }).click();
  // waitForURL (unlike toHaveURL) waits for that navigation to fully
  // load, so the session cookie's clearing — set on an intermediate
  // response in the redirect chain — is guaranteed to have landed before
  // the next step re-requests a protected page.
  await page.waitForURL("/");

  // The session is really gone server-side, not just a client-side redirect.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("the authenticated creator's real identity is displayed, not a hardcoded name", async ({ page }) => {
  await login(page, DEMO_EMAIL, DEMO_PASSWORD);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Good (morning|afternoon|evening), Arjun Raj/);
  await expect(page.getByText(DEMO_EMAIL)).toBeVisible();
});

test("a direct refresh of a protected page keeps the session authenticated", async ({ page }) => {
  await login(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.reload();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Good (morning|afternoon|evening),/);
});
