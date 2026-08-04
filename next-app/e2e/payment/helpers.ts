import { expect, type Page } from "@playwright/test";
import { clickAndWaitForURL } from "../mutations/helpers";
import { waitForFileStatus } from "../helpers/wait-for-file-status";

export { login, clickAndWaitForURL, DEMO_EMAIL, DEMO_PASSWORD } from "../mutations/helpers";

export type DeliveryMode = "PAYMENT_REQUIRED" | "APPROVAL_ONLY";

/** Drives the real five-step wizard (see e2e/mutations/mutations.spec.ts) end to end, returning the created workspace's URL. */
export async function createWorkspaceViaWizard(
  page: Page,
  options: { title: string; amount?: string; deliveryMode?: DeliveryMode },
): Promise<string> {
  await page.goto("/workspaces/new");
  await page.getByLabel(/workspace title/i).fill(options.title);
  await page.getByLabel(/client name/i).fill("Payment Suite Client");
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 2 (deliverables)
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 3 (protection)
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 4 (delivery/payment)

  if (options.deliveryMode === "APPROVAL_ONLY") {
    await page.getByRole("radio", { name: /approval only/i }).check();
  }
  if (options.amount) {
    await page.getByLabel(/^amount/i).fill(options.amount);
  }

  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 5 (review)
  await clickAndWaitForURL(
    page,
    page.getByRole("button", { name: /create workspace/i }),
    /\/workspaces\/(?!new$)[a-z0-9]+$/,
  );
  return page.url();
}

/** Uploads one file on the creator's Files tab and waits for it to reach Ready. */
export async function uploadFileAndWaitReady(page: Page, workspaceUrl: string, filePath: string): Promise<void> {
  await page.goto(workspaceUrl);
  await page.getByRole("tab", { name: /^files$/i }).click();
  await page.getByLabel(/choose files to upload/i).setInputFiles(filePath);
  const fileName = filePath.split(/[\\/]/).pop()!;
  await waitForFileStatus(page, { fileName, expectedStatus: "Ready", reselectFilesTab: true });
}

/** Creates a secure review link from the Files tab (must already be on it) and returns the raw URL. */
export async function createReviewLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: /create secure review link/i }).click();
  const linkInput = page.getByTestId("review-link-input");
  // See review.spec.ts's equivalent comment: this Server Action writes the
  // workspace and generates a secure token, which can exceed the default
  // 5s expect timeout under load — wait for its own pending state to
  // actually finish rather than a short, arbitrary timeout.
  await expect(linkInput).toBeVisible({ timeout: 60_000 });
  return linkInput.inputValue();
}

/** Client-side approval, same dialog for every delivery mode that allows approval (PAYMENT_REQUIRED/APPROVAL_ONLY). */
export async function approveAsClient(page: Page, reviewerName = "Rohit Sharma"): Promise<void> {
  await page.getByRole("button", { name: /^approve project$/i }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: /approve this project/i });
  await dialog.getByLabel(/your name/i).fill(reviewerName);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: /^approve project$/i }).click();
  await expect(page.getByText(new RegExp(`approved by ${reviewerName}`, "i"))).toBeVisible({ timeout: 10_000 });
}

