import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("clients visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/clients");
  await expect(page).toHaveScreenshot("clients.png");
});
