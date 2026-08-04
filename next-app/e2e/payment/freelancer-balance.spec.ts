import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/** Freelancer financial overview on /payments — see payment-explorer.tsx. */
test("shows the financial overview sections", async ({ page }) => {
  await login(page);
  await page.goto("/payments");

  await expect(page.getByText("Financial Overview")).toBeVisible();
  await expect(page.getByText("Total Received", { exact: true })).toBeVisible();
  await expect(page.getByText("Outstanding", { exact: true })).toBeVisible();
  await expect(page.getByText("Paid Projects", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending Payments", { exact: true })).toBeVisible();
});
