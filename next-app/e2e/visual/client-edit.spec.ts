import { expect, test } from "@playwright/test";
import { gotoAndStabilize } from "./utils";

test("client edit form visual baseline", async ({ page }) => {
  await gotoAndStabilize(page, "/clients/cli_rohit/edit");
  await expect(page).toHaveScreenshot("client-edit.png");
});
