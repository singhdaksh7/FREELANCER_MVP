import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/** Admin ticket status update — see admin-ticket-controls.tsx / SUPPORT_AND_DISPUTE_ARCHITECTURE.md. */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const SUBJECT = `RA Admin Status Update Ticket ${RUN_ID}`;

let ticketUrl = "";

test("creator creates a ticket to be updated by admin", async ({ page }) => {
  await login(page);
  await page.goto("/support/new");

  await page.getByLabel(/category/i).selectOption({ label: "Account" });
  await page.getByLabel(/subject/i).fill(SUBJECT);
  await page.getByLabel(/description/i).fill(`Description for ${SUBJECT}`);
  await page.getByRole("button", { name: /^create ticket$/i }).click();

  await page.waitForURL(/\/support\/(?!new$)[a-z0-9]+$/);
  ticketUrl = page.url();
});

test("admin opens the ticket, replies, and updates its status", async ({ page }) => {
  await login(page, "admin@example.com", "Demo@12345");
  const ticketId = ticketUrl.split("/").pop();
  await page.goto(`/admin/support/${ticketId}`);

  await expect(page.getByRole("heading", { name: SUBJECT })).toBeVisible();

  await page.locator('textarea[name="body"]').fill(`Admin reply — ${RUN_ID}`);
  await page.getByRole("button", { name: /^send reply$/i }).click();
  await expect(page.getByText(`Admin reply — ${RUN_ID}`)).toBeVisible({ timeout: 10_000 });

  await page.locator('select[name="status"]').selectOption("UNDER_REVIEW");
  await page.getByRole("button", { name: /^update status$/i }).click();
  await expect(page.getByText("Under Review", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
});

test("the creator sees the admin's reply and the updated status on their own ticket page", async ({ page }) => {
  await login(page);
  await page.goto(ticketUrl);

  await expect(page.getByText(`Admin reply — ${RUN_ID}`)).toBeVisible();
  await expect(page.getByText("Under Review", { exact: true }).first()).toBeVisible();
});
