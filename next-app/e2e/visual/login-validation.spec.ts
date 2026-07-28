import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

// This screen is public — override the visual projects' shared
// authenticated storageState with a fresh, logged-out context.
test.use({ storageState: { cookies: [], origins: [] } });

test("login validation-error visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/login");
  await page.getByLabel(/email address/i).fill("arjun@example.com");
  await page.getByLabel(/^password$/i).fill("the-wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  // Also wait for the button to settle back from its "Signing In…"
  // pending label — otherwise the screenshot can race ahead and capture
  // an interim pending-state render instead of the final error state.
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  await expect(page).toHaveScreenshot("login-validation-error.png");
});
