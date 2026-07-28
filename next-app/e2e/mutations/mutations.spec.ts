import { test, expect } from "@playwright/test";
import { login, clickAndWaitForURL } from "./helpers";

/**
 * Functional coverage of real client + workspace CRUD against the real
 * seeded database — no mocking. All tests live in one file and run
 * serially: later tests depend on records earlier ones create, and
 * keeping everything in one file guarantees Playwright schedules them on
 * a single worker (separate files can otherwise land on different
 * workers and contend for the one shared dev server process, which was
 * flaky in this environment — the same accommodation e2e/auth/auth-flow.spec.ts
 * documents for the same reason).
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const CLIENT_NAME = `Playwright Test Client ${RUN_ID}`;
const CLIENT_NAME_RENAMED = `${CLIENT_NAME} (renamed)`;
const CLIENT_EMAIL = `playwright-test-${RUN_ID}@example.com`;
const WORKSPACE_TITLE = `Playwright Test Workspace ${RUN_ID}`;

let workspaceUrl = "";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("client CRUD", () => {
  test("creates a client", async ({ page }) => {
    await page.goto("/clients");
    await clickAndWaitForURL(page, page.getByRole("link", { name: /add new client/i }), /\/clients\/new$/);

    await page.getByLabel(/^name/i).fill(CLIENT_NAME);
    await page.getByLabel(/^email/i).fill(CLIENT_EMAIL);
    await clickAndWaitForURL(page, page.getByRole("button", { name: /add client/i }), /\/clients$/);

    await expect(page.getByText(`${CLIENT_NAME} was added.`)).toBeVisible();
    await expect(page.getByText(CLIENT_NAME, { exact: true }).first()).toBeVisible();
  });

  test("shows a validation error instead of creating an invalid client", async ({ page }) => {
    await page.goto("/clients/new");

    await page.getByLabel(/^name/i).fill("Invalid Email Client");
    await page.getByLabel(/^email/i).fill("not-an-email");
    await page.getByRole("button", { name: /add client/i }).click();

    await expect(page).toHaveURL(/\/clients\/new$/); // never navigated away
    await expect(page.getByText(/enter a valid email address/i)).toBeVisible();
  });

  test("edits the client created above", async ({ page }) => {
    await page.goto("/clients");
    const tableRow = page.locator("tr", { hasText: CLIENT_NAME }).first();
    await clickAndWaitForURL(page, tableRow.getByRole("link", { name: /^edit$/i }), /\/clients\/[a-z0-9]+\/edit$/);

    await expect(page.getByLabel(/^name/i)).toHaveValue(CLIENT_NAME);
    await page.getByLabel(/^name/i).fill(CLIENT_NAME_RENAMED);
    await clickAndWaitForURL(page, page.getByRole("button", { name: /save changes/i }), /\/clients$/);

    await expect(page.getByText(`${CLIENT_NAME_RENAMED} was updated.`)).toBeVisible();
  });

  test("blocks deleting a client that still has workspaces", async ({ page }) => {
    await page.goto("/clients");
    const rohitRow = page.getByText("Rohit Sharma", { exact: true }).first();
    await expect(rohitRow).toBeVisible();

    // Delete buttons are per-row; scope to Rohit's row via the desktop table.
    const tableRow = page.locator("tr", { hasText: "Rohit Sharma" }).first();
    await tableRow.getByRole("button", { name: /^delete$/i }).click();

    await expect(page.getByRole("heading", { name: /delete rohit sharma\?/i })).toBeVisible();
    await page.getByRole("button", { name: /delete client/i }).click();

    await expect(page.getByText(/has workspaces and cannot be deleted/i)).toBeVisible();
    // Dialog stays open and the client is not actually removed.
    await expect(page.getByRole("heading", { name: /delete rohit sharma\?/i })).toBeVisible();
  });

  test("deletes the (unused) client created above", async ({ page }) => {
    await page.goto("/clients");
    const tableRow = page.locator("tr", { hasText: CLIENT_NAME_RENAMED }).first();
    await tableRow.getByRole("button", { name: /^delete$/i }).click();

    await expect(page.getByRole("heading", { name: `Delete ${CLIENT_NAME_RENAMED}?` })).toBeVisible();
    await page.getByRole("button", { name: /delete client/i }).click();

    // Wait for the dialog to close (the confirm heading disappearing) before
    // checking the row, since the heading itself also contains the client's
    // name and would otherwise make the row-count assertion below racy.
    await expect(page.getByRole("heading", { name: `Delete ${CLIENT_NAME_RENAMED}?` })).toHaveCount(0);
    // The row disappearing (via the Server Action's revalidatePath) is the
    // behavior that actually matters here; the local success toast can race
    // against that same re-render, so it isn't asserted separately.
    await expect(page.getByText(CLIENT_NAME_RENAMED, { exact: true })).toHaveCount(0);
  });
});

test.describe("workspace CRUD", () => {
  test("creates a draft workspace through the five-step wizard", async ({ page }) => {
    await page.goto("/workspaces/new");

    await page.getByLabel(/^title/i).fill(WORKSPACE_TITLE);
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 2 (deliverables)
    await expect(page.getByText(/coming in phase 5/i)).toBeVisible();
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 3 (protection)
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 4 (payment)
    await page.getByLabel(/^amount/i).fill("18500");
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 5 (review)

    await expect(page.locator("legend", { hasText: /review & create/i })).toBeVisible();
    // Excludes "new" (the current page) — otherwise this matches
    // immediately, before the real navigation even starts, since "new" is
    // itself a lowercase-alphanumeric path segment. See clickAndWaitForURL's
    // doc comment for why the click itself isn't awaited directly.
    await clickAndWaitForURL(
      page,
      page.getByRole("button", { name: /create draft workspace/i }),
      /\/workspaces\/(?!new$)[a-z0-9]+$/,
    );
    workspaceUrl = page.url();

    await expect(page.getByText("Workspace created as a draft.")).toBeVisible();
    await expect(page.getByRole("heading", { name: WORKSPACE_TITLE })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  });

  test("a direct refresh of the workspace details page keeps the same data", async ({ page }) => {
    await page.goto(workspaceUrl);
    await page.reload();

    await expect(page.getByRole("heading", { name: WORKSPACE_TITLE })).toBeVisible();
  });

  test("edits the workspace", async ({ page }) => {
    await page.goto(workspaceUrl);
    await clickAndWaitForURL(page, page.getByRole("link", { name: /edit workspace/i }), /\/edit$/);

    await page.getByLabel(/^amount/i).fill("21000");
    // Not asserting the exact redirect URL (its `?flash=` query is
    // URL-encoded and then immediately stripped by FlashToast, so pinning
    // the literal string is racy) — the flash message and updated amount
    // rendering are the actual behaviors under test.
    await clickAndWaitForURL(page, page.getByRole("button", { name: /save changes/i }), /\/workspaces\/[a-z0-9]+/);

    await expect(page.getByText("Workspace updated.")).toBeVisible();
    await expect(page.getByText(/₹21,000/).first()).toBeVisible();
  });

  test("an unauthorized workspace id resolves through not-found, never a 403", async ({ page }) => {
    // ws_portfolio_refresh belongs to Meera Shah, not the signed-in Arjun.
    await page.goto("/workspaces/ws_portfolio_refresh");
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });

  test("the wizard is usable at a mobile viewport with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspaces/new");

    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasOverflow).toBe(false);

    await page.getByLabel(/^title/i).fill("Mobile Wizard Check");
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByText(/coming in phase 5/i)).toBeVisible();
    await page.getByRole("button", { name: /^back$/i }).click();
    await expect(page.getByLabel(/^title/i)).toHaveValue("Mobile Wizard Check");
  });

  test("cancels the workspace", async ({ page }) => {
    await page.goto(workspaceUrl);
    await page.getByRole("button", { name: /^cancel workspace$/i }).click();
    await expect(page.getByRole("heading", { name: /cancel this workspace\?/i })).toBeVisible();
    await page.getByRole("button", { name: /yes, cancel workspace/i }).click();

    // The dialog's onSuccess triggers a router.refresh() (no URL change, so
    // there's nothing to waitForURL on) — waiting for the now-illegal
    // "Cancel Workspace" trigger to disappear is the real completion signal
    // for that refreshed Server Component render.
    await expect(page.getByRole("button", { name: /^cancel workspace$/i })).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
  });
});
