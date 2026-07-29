import { test, expect } from "@playwright/test";
import { login, clickAndWaitForURL } from "./helpers";

/**
 * Inline client creation inside workspace creation — isolated coverage
 * distinct from the shared mutations-e2e suite (e2e/mutations/mutations.spec.ts),
 * per the phase brief's request for dedicated Playwright coverage of this
 * flow. See REQUIREMENTS_ALIGNMENT.md §1.
 */
const RUN_ID = Date.now();

test("creates a client inline during workspace creation, without leaving the wizard", async ({ page }) => {
  await login(page);

  const inlineClientName = `RA Inline Client ${RUN_ID}`;
  const inlineClientEmail = `ra-inline-${RUN_ID}@example.com`;
  const workspaceTitle = `RA Inline-Client Workspace ${RUN_ID}`;

  await page.goto("/workspaces/new");
  await page.getByLabel(/^title/i).fill(workspaceTitle);

  await page.getByRole("button", { name: /add new client/i }).click();
  const dialog = page.getByRole("dialog", { name: /add new client/i });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/client name/i).fill(inlineClientName);
  await dialog.getByLabel(/^email/i).fill(inlineClientEmail);
  await dialog.getByRole("button", { name: /^add client$/i }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("combobox", { name: /^client/i }).locator("option:checked")).toHaveText(inlineClientName);

  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 2
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 3
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 4
  await page.getByLabel(/^amount/i).fill("5000");
  await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 5

  await expect(page.getByText(inlineClientName, { exact: true })).toBeVisible();
  await clickAndWaitForURL(
    page,
    page.getByRole("button", { name: /create draft workspace/i }),
    /\/workspaces\/(?!new$)[a-z0-9]+$/,
  );

  await expect(page.getByRole("heading", { name: workspaceTitle })).toBeVisible();
  await expect(page.getByText(inlineClientName, { exact: true }).first()).toBeVisible();
});
