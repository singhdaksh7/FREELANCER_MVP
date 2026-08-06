import { test, expect, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, submitWorkspaceCreation, WORKSPACE_SUCCESS_URL_PATTERN } from "./helpers";

test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const CLIENT_NAME = `Wizard Submit Regression Client ${RUN_ID}`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let validImagePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-wizard-regression-"));
  validImagePath = await writeValidJpegFixture(dir, `wizard-regression-${RUN_ID}.jpg`, 100, 100);
});

test.afterAll(async () => {
  await pool.end();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function reachConfirmationStep(page: Page, title: string): Promise<void> {
  await page.goto("/workspaces/new");
  await page.getByLabel(/workspace title/i).fill(title);
  await page.getByLabel(/client name/i).fill(CLIENT_NAME);
  await page.getByLabel(/^amount/i).fill("9999");
  await page.getByLabel(/choose files to upload/i).setInputFiles(validImagePath);

  const continueButton = page.getByRole("button", { name: /continue to confirmation/i });
  await expect(continueButton).toBeVisible({ timeout: 10_000 });
  await expect(continueButton).toBeEnabled({ timeout: 20_000 });
  await continueButton.click();

  await expect(page.locator("legend", { hasText: /Step 2: Confirm/i })).toBeVisible({ timeout: 10_000 });
}

function workspaceIdFromSuccessUrl(url: string): string {
  const match = url.match(/\/workspaces\/([a-z0-9-]+)\/success$/);
  expect(match).not.toBeNull();
  expect(match![1]).not.toBe("new");
  return match![1];
}

async function countWorkspacesByTitle(title: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM "workspaces" WHERE "title" = $1',
    [title],
  );
  return result.rows[0]?.count ?? 0;
}

test("disabled submit button fails the deterministic helper", async ({ page }) => {
  await page.setContent(`
    <form>
      <button type="submit" disabled>Confirm & Create Workspace</button>
    </form>
  `);

  await expect(submitWorkspaceCreation(page, { assertionTimeout: 250 })).rejects.toThrow();
});

test("missing form fails the deterministic helper", async ({ page }) => {
  await page.setContent(`<button type="submit">Confirm & Create Workspace</button>`);

  await expect(submitWorkspaceCreation(page, { assertionTimeout: 250 })).rejects.toThrow();
});

test("no submission error is swallowed when the form is invalid", async ({ page }) => {
  await page.setContent(`
    <form>
      <input name="workspaceId" required value="">
      <button type="submit">Confirm & Create Workspace</button>
    </form>
  `);

  await expect(submitWorkspaceCreation(page, { assertionTimeout: 250 })).rejects.toThrow(
    /Expected workspace creation form to be valid before submission/,
  );
});

test("submission navigates exactly once and the committed workspace exists after navigation", async ({ page }) => {
  const title = `Wizard Submit Regression Nav Once ${RUN_ID}`;
  await reachConfirmationStep(page, title);

  const successNavigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && WORKSPACE_SUCCESS_URL_PATTERN.test(frame.url())) {
      successNavigations.push(frame.url());
    }
  });

  const successUrl = await submitWorkspaceCreation(page);
  expect(successUrl).toMatch(WORKSPACE_SUCCESS_URL_PATTERN);
  expect(successNavigations).toHaveLength(1);

  const workspaceId = workspaceIdFromSuccessUrl(successUrl);
  const workspace = await pool.query<{ id: string; title: string; clientName: string }>(
    'SELECT "id", "title", "clientName" FROM "workspaces" WHERE "id" = $1',
    [workspaceId],
  );
  expect(workspace.rows[0]).toEqual({ id: workspaceId, title, clientName: CLIENT_NAME });
});

test("duplicate submission does not create a second workspace", async ({ page }) => {
  const title = `Wizard Submit Regression Duplicate ${RUN_ID}`;
  await reachConfirmationStep(page, title);

  const createButton = page.getByRole("button", { name: /create workspace/i });
  const form = createButton.locator("xpath=ancestor::form[1]");

  await expect(form).toBeVisible({ timeout: 10_000 });
  await expect(createButton).toBeEnabled({ timeout: 10_000 });
  const navigationPromise = page.waitForURL(WORKSPACE_SUCCESS_URL_PATTERN, { timeout: 120_000 });

  await form.evaluate((node) => {
    if (!(node instanceof HTMLFormElement)) {
      throw new Error("Expected workspace creation form.");
    }
    if (!node.checkValidity()) {
      throw new Error("Expected workspace creation form to be valid before submission.");
    }
    node.requestSubmit();
    node.requestSubmit();
  });

  await navigationPromise;
  expect(await countWorkspacesByTitle(title)).toBe(1);
});

test("workspace submit helpers contain no swallowed click or submission errors", async () => {
  const helperSources = [
    "e2e/requirements-alignment/helpers.ts",
    "e2e/payment/helpers.ts",
    "e2e/visual/wizard-helpers.ts",
    "e2e/mutations/helpers.ts",
  ].map((path) => readFileSync(path, "utf8"));

  for (const source of helperSources) {
    expect(source).not.toContain("void createButton" + ".click()" + ".catch(() => {})");
    expect(source).not.toContain("void createBtn" + ".click()" + ".catch(() => {})");
    expect(source).not.toMatch(/\.click\(\)\.catch\(\(\) => \{\}\)/);
  }
});
