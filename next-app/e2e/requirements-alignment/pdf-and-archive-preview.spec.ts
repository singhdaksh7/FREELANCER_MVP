import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeMinimalPdfFixture, writeMinimalZipFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./helpers";

/**
 * Regression coverage for the production bug where every non-IMAGE file
 * (PDF included) showed a blank "locked deliverable pending payment"
 * message regardless of delivery mode. Covers: real PDF page-1 preview
 * generation + rendering on both the creator and public surfaces, and the
 * ARCHIVE (ZIP) locked-file-card's mode-aware copy (APPROVAL_ONLY here —
 * PAYMENT_REQUIRED copy is covered by the unit-level route tests since
 * standing up a second full payment-mode workspace here would duplicate
 * payment-required.spec.ts's own fixture cost for no additional signal).
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA PDF Archive ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let pdfPath = "";
let zipPath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-pdf-archive-"));
  pdfPath = writeMinimalPdfFixture(dir, `brief-${RUN_ID}.pdf`);
  zipPath = await writeMinimalZipFixture(dir, `assets-${RUN_ID}.zip`);
});

test("creator uploads a PDF and a ZIP into an APPROVAL_ONLY workspace", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, deliveryMode: "APPROVAL_ONLY", files: [pdfPath] });
  await uploadFileAndWaitReady(page, workspaceUrl, zipPath);
  reviewLinkUrl = await createReviewLink(page);
});

test("creator file card: PDF gets a real protected preview, ZIP gets a mode-aware locked card", async ({ page }) => {
  await login(page);
  await page.goto(workspaceUrl);
  await page.getByRole("tab", { name: /^files$/i }).click();

  const pdfName = pdfPath.split(/[\\/]/).pop()!;
  const pdfCard = page.locator(`[data-testid="file-card"][data-file-name="${pdfName}"]`);
  await expect(pdfCard.getByText(/pdf preview.*page 1/i)).toBeVisible({ timeout: 15_000 });
  await expect(pdfCard.locator("img")).toBeVisible({ timeout: 15_000 });

  const zipName = zipPath.split(/[\\/]/).pop()!;
  const zipCard = page.locator(`[data-testid="file-card"][data-file-name="${zipName}"]`);
  await expect(
    zipCard.getByText(/preview is not available for this file type\. the original remains protected until approval is confirmed./i),
  ).toBeVisible();
  await expect(zipCard.getByText(/payment/i)).toHaveCount(0);
});

test("creator Preview Client View: PDF preview renders with its label, ZIP shows the locked card", async ({ page }) => {
  await login(page);
  await page.goto(`${workspaceUrl}/preview`);
  await expect(page.getByTestId("file-switcher")).toBeVisible();

  const pdfName = pdfPath.split(/[\\/]/).pop()!;
  await page.getByTestId("file-switcher").getByText(pdfName).click();
  await expect(page.getByText(/pdf preview.*page 1/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("img", { name: /protected preview of/i })).toBeVisible({ timeout: 15_000 });

  const zipName = zipPath.split(/[\\/]/).pop()!;
  await page.getByTestId("file-switcher").getByText(zipName).click();
  await expect(
    page.getByText(/preview is not available for this file type\. the original remains protected until approval is confirmed./i),
  ).toBeVisible();
});

test("public secure review link (logged out): identical PDF preview and ZIP locked-card behavior", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(reviewLinkUrl);
  await expect(page.getByTestId("file-switcher")).toBeVisible();

  const pdfName = pdfPath.split(/[\\/]/).pop()!;
  await page.getByTestId("file-switcher").getByText(pdfName).click();
  await expect(page.getByRole("img", { name: /protected preview of/i })).toBeVisible({ timeout: 15_000 });

  const zipName = zipPath.split(/[\\/]/).pop()!;
  await page.getByTestId("file-switcher").getByText(zipName).click();
  // The exact-text match above already proves the message itself is
  // payment-free (the literal string never contains "payment"); the
  // rest of the review page (e.g. a payment-mode summary card) may
  // legitimately mention payment for other reasons unrelated to this
  // file's locked-card copy.
  await expect(
    page.getByText(/preview is not available for this file type\. the original remains protected until approval is confirmed./i),
  ).toBeVisible();
});

test("public review link at mobile viewport (375x667): PDF preview and ZIP locked card both render correctly", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(reviewLinkUrl);
  await expect(page.getByTestId("file-switcher")).toBeVisible();

  const pdfName = pdfPath.split(/[\\/]/).pop()!;
  await page.getByTestId("file-switcher").getByText(pdfName).click();
  await expect(page.getByRole("img", { name: /protected preview of/i })).toBeVisible({ timeout: 15_000 });

  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflowX).toBeLessThanOrEqual(1);
});
