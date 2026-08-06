import { expect, type Locator, type Page } from "@playwright/test";

export const DEMO_EMAIL = "arjun@example.com";
export const DEMO_PASSWORD = "Demo@12345";
export const WORKSPACE_SUCCESS_URL_PATTERN = /\/workspaces\/(?!new(?:\/|$))[a-z0-9-]+\/success$/;

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
  await Promise.all([
    page.waitForURL(urlPattern),
    locator.click(),
  ]);
}

export async function submitWorkspaceCreation(
  page: Page,
  options: { assertionTimeout?: number; navigationTimeout?: number } = {},
): Promise<string> {
  const expectedUrl = WORKSPACE_SUCCESS_URL_PATTERN;
  const assertionTimeout = options.assertionTimeout ?? 10_000;
  const navigationTimeout = options.navigationTimeout ?? 120_000;
  const createButton = page.getByRole("button", { name: /create workspace/i });
  const form = createButton.locator("xpath=ancestor::form[1]");

  await expect(form).toBeVisible({ timeout: assertionTimeout });
  await expect(createButton).toBeVisible({ timeout: assertionTimeout });
  await expect(createButton).toBeEnabled({ timeout: assertionTimeout });

  await form.evaluate((node) => {
    if (!(node instanceof HTMLFormElement)) {
      throw new Error("Expected workspace creation form.");
    }
    if (!node.checkValidity()) {
      throw new Error("Expected workspace creation form to be valid before submission.");
    }
  });

  const navigationPromise = page.waitForURL(expectedUrl, {
    timeout: navigationTimeout,
  });

  await form.evaluate((node) => {
    if (!(node instanceof HTMLFormElement)) {
      throw new Error("Expected workspace creation form.");
    }
    node.requestSubmit();
  });

  await navigationPromise;
  return page.url();
}
