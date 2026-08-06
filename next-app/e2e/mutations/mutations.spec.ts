import { test, expect } from "@playwright/test";
import { login, submitWorkspaceCreation } from "./helpers";
import { writeValidJpegFixture } from "../file-fixtures";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const CLIENT_NAME = "Playwright Test Client " + RUN_ID;
const WORKSPACE_TITLE = "Playwright Test Workspace " + RUN_ID;

let workspaceUrl = "";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("workspace CRUD", () => {
  test("creates a draft workspace through the two-step wizard, with the client name entered as plain text", async ({ page }) => {
    await page.goto("/workspaces/new");

    await page.getByLabel(/workspace title/i).fill(WORKSPACE_TITLE);
    await page.getByLabel(/client name/i).fill(CLIENT_NAME);
    await page.getByLabel(/^amount/i).fill("18500");

    // Upload a dummy file to bypass the wizard's new file requirement
    const dir = mkdtempSync(join(tmpdir(), "vault-dummy-mutations-1-"));
    const dummyPath = await writeValidJpegFixture(dir, "dummy-1.jpg", 100, 100);
    await page.getByLabel(/choose files to upload/i).setInputFiles(dummyPath);

    // Proceed to Step 2
    const continueBtn = page.getByRole("button", { name: /continue to confirmation/i });
    await expect(continueBtn).toBeVisible({ timeout: 10_000 });
    await continueBtn.click();

    await expect(page.locator("legend", { hasText: /Step 2: Confirm/i })).toBeVisible();
    await expect(page.getByText(CLIENT_NAME)).toBeVisible();

    await submitWorkspaceCreation(page);

    await page.getByRole("link", { name: /manage workspace|view workspace/i }).click();
    await page.waitForURL(/\/workspaces\/(?!new$)[a-z0-9-]+$/);

    workspaceUrl = page.url();

    await expect(page.getByRole("heading", { name: WORKSPACE_TITLE })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  });

  test("never renders a client selector or an Add New Client control", async ({ page }) => {
    await page.goto("/workspaces/new");

    await expect(page.getByRole("combobox", { name: /client/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /add new client/i })).toHaveCount(0);
    await expect(page.getByLabel(/client name/i)).toBeVisible();
  });

  test("creates an APPROVAL_ONLY workspace with no amount required, and the workspace detail page reflects it", async ({ page }) => {
    const approvalOnlyTitle = "Playwright Approval-Only Workspace " + RUN_ID;

    await page.goto("/workspaces/new");
    await page.getByLabel(/workspace title/i).fill(approvalOnlyTitle);
    await page.getByLabel(/client name/i).fill(CLIENT_NAME);

    const approvalOnlyRadio = page.getByRole("radio", { name: /approval only/i });
    await approvalOnlyRadio.check();
    await expect(approvalOnlyRadio).toBeChecked();

    await expect(page.getByLabel(/^amount/i)).toHaveCount(0);
    await expect(page.getByLabel(/^currency/i)).toHaveCount(0);

    // Upload a dummy file to bypass the wizard's new file requirement
    const dir = mkdtempSync(join(tmpdir(), "vault-dummy-mutations-2-"));
    const dummyPath = await writeValidJpegFixture(dir, "dummy-2.jpg", 100, 100);
    await page.getByLabel(/choose files to upload/i).setInputFiles(dummyPath);

    // Proceed to Step 2
    const continueBtn = page.getByRole("button", { name: /continue to confirmation/i });
    await expect(continueBtn).toBeVisible({ timeout: 10_000 });
    await continueBtn.click();

    await expect(page.locator("legend", { hasText: /Step 2: Confirm/i })).toBeVisible();
    await expect(page.getByText("Approval Only", { exact: true }).first()).toBeVisible();

    await submitWorkspaceCreation(page);

    await page.getByRole("link", { name: /manage workspace|view workspace/i }).click();
    await page.waitForURL(/\/workspaces\/(?!new$)[a-z0-9-]+$/);

    await expect(page.getByRole("heading", { name: approvalOnlyTitle })).toBeVisible();
    await expect(page.getByText("Approval Only", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^request payment$/i })).toHaveCount(0);
  });

  test("edits the workspace from DRAFT back to DRAFT, changing only the client name", async ({ page }) => {
    await page.goto(workspaceUrl);

    await page.getByRole("link", { name: /edit workspace/i }).click();

    const newClientName = CLIENT_NAME + " (Edited)";
    await page.getByLabel(/client name/i).fill(newClientName);

    // Submit
    await page.getByRole("button", { name: /^save changes$/i }).click();

    // Wait for the redirect back to the details page
    await page.waitForURL(/\/workspaces\/(?!new$)(?!.*\/edit$)[a-z0-9-]+$/);

    await expect(page.getByText(newClientName, { exact: true }).first()).toBeVisible();
  });
});
