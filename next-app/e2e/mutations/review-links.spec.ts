import { test, expect } from "@playwright/test";
import { login, submitWorkspaceCreation } from "./helpers";
import { writeValidJpegFixture } from "../file-fixtures";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "crypto";

test.describe("Review Links (Dashboard)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  const RUN_ID = randomUUID().split("-")[0];
  const CLIENT_NAME = "Link Client " + RUN_ID;
  const WORKSPACE_TITLE = "Link Workspace " + RUN_ID;

  test("generates, copies, and regenerates review links directly on the dashboard", async ({ page }) => {
    // 1. Setup - Create an IN_REVIEW workspace so it is eligible for link generation
    await login(page);
    await page.goto("/workspaces/new");
    await page.getByLabel(/workspace title/i).fill(WORKSPACE_TITLE);
    await page.getByLabel(/client name/i).fill(CLIENT_NAME);
    await page.getByRole("radio", { name: /approval only/i }).check();


    // Upload a small file
    const dir = mkdtempSync(join(tmpdir(), "vault-dummy-review-links-"));
    const validImagePath = await writeValidJpegFixture(dir, "1000x1000.jpg", 100, 100);
    await page.getByLabel(/choose files to upload/i).setInputFiles(validImagePath);
    await expect(page.locator("[data-testid='file-status']").filter({ hasText: /Ready/i })).toBeVisible({ timeout: 20_000 });

    // Move to step 2 and create
    await page.getByRole("button", { name: /continue to confirmation/i }).click();
    await submitWorkspaceCreation(page);

    // Get the workspace ID from URL and mark it IN_REVIEW directly via DB or by clicking "Submit to client"
    // The easiest way is to click "Manage Details" -> "Submit for Review"
    // Wait, let's just go to the workspace details and submit it
    await page.getByRole("link", { name: /manage workspace|view workspace/i }).click();

    // Oh wait! The current status is DRAFT (because finalizeWorkspaceDraft leaves it DRAFT).
    // Let's go back to Dashboard. The dashboard label should say "Ready to share" (derived label).
    await page.goto("/dashboard");
    const card = page.locator(".bg-surface-card", { hasText: WORKSPACE_TITLE });
    await expect(card.getByText("Ready to share")).toBeVisible();

    // The user's spec states "Generate Link on dashboard". But "Ready to share" is DRAFT.
    // If it's DRAFT, we can click "Generate Link" on the dashboard because isActionable is true.
    await expect(card.getByRole("button", { name: "Generate Link" })).toBeVisible();
    await card.getByRole("button", { name: "Generate Link" }).click();

    // It should now show "Copy Link" and a read-only input
    await expect(card.getByText("Secure review link ready:")).toBeVisible();
    await expect(card.getByRole("button", { name: "Copy Link" })).toBeVisible();

    // The URL should be in the input
    const input = card.locator("input[readonly]");
    const rawUrl = await input.inputValue();
    expect(rawUrl).toContain("/review/");
    expect(rawUrl).toMatch(/^https?:\/\//); // absolute URL

    // We can also click Copy Link
    await card.getByRole("button", { name: "Copy Link" }).click();
    await expect(card.getByRole("button", { name: "Copied!" })).toBeVisible();

    // 2. Reload page - verify Generate New Link
    await page.reload();
    // Re-locate card after reload
    const reloadedCard = page.locator(".bg-surface-card", { hasText: WORKSPACE_TITLE });

    // Raw token should not be persisted anywhere on the page
    const pageContent = await page.content();
    const tokenPart = rawUrl.split("/review/")[1];
    expect(pageContent).not.toContain(tokenPart);

    // Active link exists but no raw token in session -> Generate New Link
    await expect(reloadedCard.getByRole("button", { name: "Generate New Link" })).toBeVisible();

    // 3. Generate New Link revokes old link
    await reloadedCard.getByRole("button", { name: "Generate New Link" }).click();
    await expect(reloadedCard.getByText("Secure review link ready:")).toBeVisible();

    const newInput = reloadedCard.locator("input[readonly]");
    const newRawUrl = await newInput.inputValue();
    expect(newRawUrl).not.toEqual(rawUrl);

    // 4. Verify the old link is revoked by visiting it
    // Wait, the test uses the same page/session. Let's just visit the old URL.
    await page.goto(rawUrl);
    // Should see an error or 404 because it's revoked
    await expect(page.getByRole("heading", { name: /secure link revoked/i })).toBeVisible();
    await expect(page.getByText(/this review link has been revoked by the creator/i)).toBeVisible();

    // Visit the new link - should work (shows client preview)
    await page.goto(newRawUrl);
    await expect(page.getByText(WORKSPACE_TITLE)).toBeVisible();
    // It should also show the INLAY PROTECTED PREVIEW watermark!
    // But we don't have to test image rendering here.
  });
});
