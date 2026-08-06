import { expect, type Page } from "@playwright/test";
import { waitForFileStatus } from "../helpers/wait-for-file-status";
import { writeValidJpegFixture } from "../file-fixtures";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { submitWorkspaceCreation } from "../mutations/helpers";

export { login, clickAndWaitForURL, DEMO_EMAIL, DEMO_PASSWORD } from "../mutations/helpers";

export type DeliveryMode = "PAYMENT_REQUIRED" | "APPROVAL_ONLY";

export async function createWorkspaceViaWizard(
  page: Page,
  options: { title: string; amount?: string; deliveryMode?: DeliveryMode; files?: string[] },
): Promise<string> {
  await page.goto("/workspaces/new");
  await page.getByLabel(/workspace title/i).fill(options.title);
  await page.getByLabel(/client name/i).fill("Requirements Suite Client");

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
    for (const filePath of filesToWaitFor) {
      const fileName = filePath.split(/[\\\/]/).pop()!;
      await waitForFileStatus(page, { fileName, expectedStatus: "Ready", reselectFilesTab: true });
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
  await waitForFileStatus(page, { fileName, expectedStatus: "Ready", reselectFilesTab: true });
}

export async function createReviewLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: /create secure review link/i }).click();
  const linkInput = page.getByTestId("review-link-input");
  await expect(linkInput).toBeVisible({ timeout: 60_000 });
  return linkInput.inputValue();
}

export async function approveAsClient(page: Page, reviewerName = "Rohit Sharma"): Promise<void> {
  await page.getByRole("button", { name: /^approve project$/i }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: /approve this project/i });
  await dialog.getByLabel(/your name/i).fill(reviewerName);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: /^approve project$/i }).click();
  await expect(page.getByText(new RegExp("approved by " + reviewerName, "i"))).toBeVisible({ timeout: 10_000 });
}
