import { test, expect } from "@playwright/test";
import { login, clickAndWaitForURL } from "./helpers";

/**
 * Functional coverage of real workspace CRUD against the real seeded
 * database — no mocking. All tests live in one file and run serially:
 * later tests depend on records earlier ones create, and keeping
 * everything in one file guarantees Playwright schedules them on a
 * single worker (separate files can otherwise land on different workers
 * and contend for the one shared dev server process, which was flaky in
 * this environment — the same accommodation e2e/auth/auth-flow.spec.ts
 * documents for the same reason).
 *
 * Phase 8 retired the saved-Client CRM entirely (see
 * MIGRATION_STATUS.md) — the workspace wizard/edit form now use a plain
 * "Client Name" textbox, never a client selector or "Add New Client"
 * modal, and creating/editing a workspace never creates a Client row.
 */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const CLIENT_NAME = `Playwright Test Client ${RUN_ID}`;
const WORKSPACE_TITLE = `Playwright Test Workspace ${RUN_ID}`;

let workspaceUrl = "";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("workspace CRUD", () => {
  test("creates a draft workspace through the five-step wizard, with the client name entered as plain text", async ({ page }) => {
    await page.goto("/workspaces/new");

    await page.getByLabel(/workspace title/i).fill(WORKSPACE_TITLE);
    await page.getByLabel(/client name/i).fill(CLIENT_NAME);
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 2 (deliverables)
    await expect(page.getByText(/drag and drop files here/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /browse files/i })).toBeVisible();
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 3 (protection)
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 4 (payment)
    await page.getByLabel(/^amount/i).fill("18500");
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 5 (review)

    // Step 5's own fieldset legend is the stable "which step am I on" signal
    // (see STEPS in workspace-wizard.tsx) — asserting through it rather than
    // through paragraph copy that can be reworded without changing behavior.
    await expect(page.locator("legend", { hasText: /review & create workspace/i })).toBeVisible();
    await expect(page.getByText(CLIENT_NAME, { exact: true })).toBeVisible();
    // Excludes "new" (the current page) — otherwise this matches
    // immediately, before the real navigation even starts, since "new" is
    // itself a lowercase-alphanumeric path segment. See clickAndWaitForURL's
    // doc comment for why the click itself isn't awaited directly.
    await clickAndWaitForURL(
      page,
      page.getByRole("button", { name: /create workspace/i }),
      /\/workspaces\/(?!new$)[a-z0-9]+$/,
    );
    workspaceUrl = page.url();

    await expect(page.getByText("Workspace created as a draft.")).toBeVisible();
    await expect(page.getByRole("heading", { name: WORKSPACE_TITLE })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(CLIENT_NAME, { exact: true }).first()).toBeVisible();
  });

  test("never renders a client selector or an Add New Client control", async ({ page }) => {
    await page.goto("/workspaces/new");

    await expect(page.getByRole("combobox", { name: /client/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /add new client/i })).toHaveCount(0);
    await expect(page.getByLabel(/client name/i)).toBeVisible();
  });

  test("creates an APPROVAL_ONLY workspace with no amount required, and the workspace detail page reflects it", async ({ page }) => {
    const approvalOnlyTitle = `Playwright Approval-Only Workspace ${RUN_ID}`;

    await page.goto("/workspaces/new");
    await page.getByLabel(/workspace title/i).fill(approvalOnlyTitle);
    await page.getByLabel(/client name/i).fill(CLIENT_NAME);
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 2
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 3
    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 4

    const approvalOnlyRadio = page.getByRole("radio", { name: /approval only/i });
    await approvalOnlyRadio.check();
    await expect(approvalOnlyRadio).toBeChecked();
    // Selecting Approval Only removes the amount control entirely — it's
    // never just disabled/optional, it isn't in the form at all — so
    // Razorpay checkout can never be initiated for this workspace later.
    await expect(page.getByLabel(/^amount/i)).toHaveCount(0);
    await expect(page.getByLabel(/^currency/i)).toHaveCount(0);

    await page.getByRole("button", { name: /^continue$/i }).click(); // -> step 5
    await expect(page.locator("legend", { hasText: /review & create workspace/i })).toBeVisible();
    await expect(page.getByText("Approval Only", { exact: true }).first()).toBeVisible();

    await clickAndWaitForURL(
      page,
      page.getByRole("button", { name: /create workspace/i }),
      /\/workspaces\/(?!new$)[a-z0-9]+$/,
    );

    await expect(page.getByRole("heading", { name: approvalOnlyTitle })).toBeVisible();
    // Behavior, not old explanatory copy: the finished workspace's Payment
    // Gate card reads "Approval Only" (never a ₹ amount) and no Razorpay
    // checkout control exists anywhere on the page.
    await expect(page.getByText("Approval Only", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^pay now$/i })).toHaveCount(0);
    await expect(page.getByText(/razorpay/i)).toHaveCount(0);
  });

  test("a direct refresh of the workspace details page keeps the same data", async ({ page }) => {
    await page.goto(workspaceUrl);
    await page.reload();

    await expect(page.getByRole("heading", { name: WORKSPACE_TITLE })).toBeVisible();
  });

  test("edits the workspace, including its client name", async ({ page }) => {
    const renamedClient = `${CLIENT_NAME} (renamed)`;
    await page.goto(workspaceUrl);
    await clickAndWaitForURL(page, page.getByRole("link", { name: /edit workspace/i }), /\/edit$/);

    await expect(page.getByLabel(/client name/i)).toHaveValue(CLIENT_NAME);
    await page.getByLabel(/client name/i).fill(renamedClient);
    await page.getByLabel(/^amount/i).fill("21000");
    // Not asserting the exact redirect URL (its `?flash=` query is
    // URL-encoded and then immediately stripped by FlashToast, so pinning
    // the literal string is racy) — the flash message and updated amount
    // rendering are the actual behaviors under test.
    await clickAndWaitForURL(page, page.getByRole("button", { name: /save changes/i }), /\/workspaces\/[a-z0-9]+/);

    await expect(page.getByText("Workspace updated.")).toBeVisible();
    await expect(page.getByText(/₹21,000/).first()).toBeVisible();
    await expect(page.getByText(renamedClient, { exact: true }).first()).toBeVisible();
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

    await page.getByLabel(/workspace title/i).fill("Mobile Wizard Check");
    await page.getByLabel(/client name/i).fill("Mobile Wizard Client");
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByText(/drag and drop files here/i)).toBeVisible();
    await page.getByRole("button", { name: /^back$/i }).click();
    await expect(page.getByLabel(/workspace title/i)).toHaveValue("Mobile Wizard Check");
  });

  test("cancels the workspace", async ({ page }) => {
    // The 30s assertion timeout below needs headroom beyond the default 30s
    // *test* timeout (playwright.config.ts) to actually apply — otherwise
    // the outer test timeout kills the test at the same moment regardless.
    test.setTimeout(60_000);
    await page.goto(workspaceUrl);
    await page.getByRole("button", { name: /^cancel workspace$/i }).click();
    await expect(page.getByRole("heading", { name: /cancel this workspace\?/i })).toBeVisible();
    await page.getByRole("button", { name: /yes, cancel workspace/i }).click();

    // The dialog's onSuccess triggers a router.refresh() (no URL change, so
    // there's nothing to waitForURL on) — waiting for the now-illegal
    // "Cancel Workspace" trigger to disappear is the real completion signal
    // for that refreshed Server Component render.
    await expect(page.getByRole("button", { name: /^cancel workspace$/i })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
  });
});

test.describe("deleted routes return 404", () => {
  for (const route of ["/clients", "/clients/new", "/support", "/support/new", "/admin/support"]) {
    test(`${route} is gone`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(404);
      await expect(page.getByText(/page not found/i)).toBeVisible();
    });
  }
});

test.describe("Preview Client View authorization", () => {
  const MEERA_EMAIL = "meera@example.com";
  const MEERA_PASSWORD = "Demo@12345";

  test("owner can open their workspace's Preview Client View from the workspace page", async ({ page, context }) => {
    // ws_brand_identity is seeded under Arjun — see prisma/seed.ts.
    await page.goto("/workspaces/ws_brand_identity");
    // The link opens in a new tab (target="_blank") — see review-link-panel.tsx.
    // Two links to the same destination exist on this page (the header
    // action bar and the Review Link panel) — `.first()` picks the header
    // one; both resolve to the identical preview URL asserted below.
    const [previewPage] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("link", { name: /preview client view/i }).first().click(),
    ]);
    await previewPage.waitForLoadState();

    await expect(previewPage).toHaveURL(/\/workspaces\/ws_brand_identity\/preview$/);
    // The banner's text is duplicated across a status-role wrapper and an
    // inner span (identical text content on both) — targeting the role is
    // the stable, unambiguous anchor.
    await expect(previewPage.getByRole("status").filter({ hasText: /preview mode/i })).toBeVisible();
  });

  test("an unauthenticated visitor is redirected to /login instead of seeing the preview", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/workspaces/ws_brand_identity/preview");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a different creator gets the same not-found page for someone else's workspace and for a nonexistent one", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel(/email address/i).fill(MEERA_EMAIL);
    await page.getByLabel(/^password$/i).fill(MEERA_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard$/);

    // ws_brand_identity belongs to Arjun, not Meera. Same rendered outcome
    // (the "page not found" boundary) as a genuinely nonexistent workspace
    // id — never a distinguishable 403. Matches the existing convention
    // for `/workspaces/[id]` itself (see "an unauthorized workspace id
    // resolves through not-found" above): a `notFound()` call from within
    // an already-matched dynamic route renders the not-found UI without
    // necessarily changing the navigation's reported status, so the
    // rendered content — not the response status — is the real assertion.
    await page.goto("/workspaces/ws_brand_identity/preview");
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await expect(page.getByText(/doesn.t exist/i)).toBeVisible();

    await page.goto("/workspaces/does-not-exist-at-all/preview");
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await expect(page.getByText(/doesn.t exist/i)).toBeVisible();
  });

  test("preview mode exposes no mutation controls", async ({ page }) => {
    await page.context().clearCookies();
    await login(page);
    await page.goto("/workspaces/ws_brand_identity/preview");
    await expect(page.getByRole("status").filter({ hasText: /preview mode/i })).toBeVisible();

    await expect(page.getByRole("button", { name: /^approve project$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /request changes/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^add pin$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^annotate$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^pay now$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /download original/i })).toHaveCount(0);
  });
});
