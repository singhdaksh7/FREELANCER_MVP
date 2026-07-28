import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("client create form visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/clients/new");
  await expect(page).toHaveScreenshot("client-new.png");
});
