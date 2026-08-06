import { expect, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { submitWorkspaceCreation } from "../mutations/helpers";

export type DeliveryMode = "PAYMENT_REQUIRED" | "APPROVAL_ONLY";

export async function loginAsCreator(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill("meera@example.com");
  await page.getByLabel(/^password$/i).fill("Demo@12345");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard$/);
}

export async function createWorkspaceViaWizard(
  page: Page,
  options: { title: string; amount?: string; deliveryMode?: DeliveryMode; files?: string[] },
): Promise<string> {
  await loginAsCreator(page);
  await page.goto("/workspaces/new");
  await page.getByLabel(/workspace title/i).fill(options.title);
  await page.getByLabel(/client name/i).fill("Visual Suite Client");

  if (options.deliveryMode === "APPROVAL_ONLY") {
    await page.getByRole("radio", { name: /approval only/i }).check();
  }
  if (options.amount) {
    await page.getByLabel(/^amount/i).fill(options.amount);
  }

  if (options.files && options.files.length > 0) {
    await page.getByLabel(/choose files to upload/i).setInputFiles(options.files);
  } else {
    // Generate a quick dummy file
    const dir = mkdtempSync(join(tmpdir(), "vault-dummy-wizard-"));
    const dummyPath = await writeValidJpegFixture(dir, "dummy-wizard-file.jpg", 100, 100);
    await page.getByLabel(/choose files to upload/i).setInputFiles(dummyPath);
  }

  // Wait for the "Continue to Confirmation" button to appear and click it
  const continueBtn = page.getByRole("button", { name: /continue to confirmation/i });
  await expect(continueBtn).toBeVisible({ timeout: 10_000 });
  await continueBtn.click();

  await submitWorkspaceCreation(page);

  await page.getByRole("link", { name: /manage workspace|view workspace/i }).click();
  await page.waitForURL(/\/workspaces\/(?!new$)[a-z0-9-]+$/);

  const filesToWaitFor = options.files && options.files.length > 0 ? options.files : ["dummy-wizard-file.jpg"];

  if (filesToWaitFor.length > 0) {
    await page.getByRole("tab", { name: /^files$/i }).click();
    for (const filePath of filesToWaitFor) {
      const fileName = filePath.split(/[\\\/]/).pop()!;
      const card = page.locator(`[data-testid="file-card"][data-file-name="${fileName}"]`);
      await expect(card.getByText("Ready", { exact: true })).toBeVisible({ timeout: 40_000 });
    }
    // Return to overview tab to leave the page in a clean state
    await page.getByRole("tab", { name: /^overview$/i }).click();
  }

  return page.url();
}

export async function uploadFileAndWaitReady(page: Page, workspaceUrl: string, filePath: string): Promise<void> {
  await page.goto(workspaceUrl);
  await page.getByRole("tab", { name: /^files$/i }).click();
  await page.getByLabel(/choose files to upload/i).setInputFiles(filePath);
  const fileName = filePath.split(/[\\\/]/).pop()!;
  const card = page.locator(`[data-testid="file-card"][data-file-name="${fileName}"]`);
  await expect(card.getByText("Ready", { exact: true })).toBeVisible({ timeout: 40_000 });
}

export async function createReviewLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: /create secure review link/i }).click();
  const linkInput = page.getByTestId("review-link-input");
  await expect(linkInput).toBeVisible({ timeout: 20_000 });
  const fullUrl = await linkInput.inputValue();
  return new URL(fullUrl).pathname;
}
