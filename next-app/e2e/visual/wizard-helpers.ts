import { expect, type Page } from "@playwright/test";

export type DeliveryMode = "PAYMENT_REQUIRED" | "APPROVAL_ONLY";

/**
 * Every visual spec that needs a workspace this suite's seed data doesn't
 * provide (APPROVAL_ONLY/PREVIEW_ONLY, a second file version, a pin, an
 * annotation...) creates one for real via the wizard — this codebase never
 * fabricates DB rows to skip the UI (see review-portal.spec.ts's doc
 * comment for the same convention applied to file uploads/review links).
 * Those workspaces are created under Meera's account (`loginAsCreator`),
 * never Arjun's: Arjun is the account behind the shared visual
 * storageState (e2e/visual/.auth/creator.json) that dashboard.spec.ts and
 * workspaces.spec.ts screenshot in full — a workspace created under Arjun
 * would permanently show up in those list views on every future run and
 * break their baselines. Meera is never used by any account-wide
 * (dashboard/workspaces-list) baseline, so she's a safe, dedicated scratch
 * account for this purpose.
 */
export async function loginAsCreator(page: Page): Promise<void> {
  // proxy.ts redirects an already-authenticated session straight to
  // /dashboard on GET /login (AUTH_ONLY_PAGES) — the shared visual
  // storageState already carries Arjun's session cookie, so it must be
  // cleared first or the email field never renders.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill("meera@example.com");
  await page.getByLabel(/^password$/i).fill("Demo@12345");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard$/);
}

export async function createWorkspaceViaWizard(
  page: Page,
  options: { title: string; amount?: string; deliveryMode?: DeliveryMode },
): Promise<string> {
  await loginAsCreator(page);
  await page.goto("/workspaces/new");
  await page.getByLabel(/^title/i).fill(options.title);
  await page.getByLabel(/client name/i).fill("Visual Suite Client");
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();

  if (options.deliveryMode === "APPROVAL_ONLY") {
    await page.getByRole("radio", { name: /approval only/i }).check();
  }
  if (options.amount) {
    await page.getByLabel(/^amount/i).fill(options.amount);
  }

  await page.getByRole("button", { name: /^continue$/i }).click();
  const createButton = page.getByRole("button", { name: /create draft workspace/i });
  void createButton.click().catch(() => {});
  await page.waitForURL(/\/workspaces\/(?!new$)[a-z0-9]+$/);
  return page.url();
}

export async function uploadFileAndWaitReady(page: Page, workspaceUrl: string, filePath: string): Promise<void> {
  await page.goto(workspaceUrl);
  await page.getByRole("tab", { name: /^files$/i }).click();
  await page.getByLabel(/choose files to upload/i).setInputFiles(filePath);
  const fileName = filePath.split(/[\\/]/).pop()!;
  const card = page.locator(`[data-testid="file-card"][data-file-name="${fileName}"]`);
  await expect(card.getByText("Ready", { exact: true })).toBeVisible({ timeout: 40_000 });
}

export async function createReviewLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: /create secure review link/i }).click();
  const linkInput = page.getByTestId("review-link-input");
  // Generous timeout: under the full visual suite's concurrency (many
  // wizard+upload flows running in parallel against the one shared dev
  // server), the Server Action behind this button can take longer than
  // Playwright's 5s default to resolve.
  await expect(linkInput).toBeVisible({ timeout: 20_000 });
  const fullUrl = await linkInput.inputValue();
  return new URL(fullUrl).pathname;
}
