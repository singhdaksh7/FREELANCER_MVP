import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./helpers";

/** Numbered image-pin creation on a desktop viewport (click) — see pin-overlay.tsx / IMAGE_ANNOTATION_ARCHITECTURE.md. */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA Image Pin Desktop ${RUN_ID}`;
const PIN_BODY = `Fix this spot — ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let filePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-pin-desktop-"));
  filePath = await writeValidJpegFixture(dir, `pin-desktop-${RUN_ID}.jpg`);
});

test("creator uploads an image and generates a review link", async ({ page }) => {
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, amount: "5000" });
  await uploadFileAndWaitReady(page, workspaceUrl, filePath);
  reviewLinkUrl = await createReviewLink(page);
});

test("client places a numbered pin on the image by clicking it", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.clearCookies();
  await page.goto(reviewLinkUrl);

  await page.getByRole("button", { name: /^add pin$/i }).click();
  const overlay = page.locator('div[role="presentation"]');
  await overlay.click({ position: { x: 100, y: 80 } });

  // Desktop and mobile both render a comments composer in the DOM (one
  // CSS-hidden depending on viewport) — scope to the visible desktop
  // <aside> to avoid a strict-mode match on the hidden mobile copy.
  const pinComposer = page.locator("aside").getByPlaceholder(/describe this pin/i);
  await expect(pinComposer).toBeVisible();
  await page.locator("aside").getByLabel(/your name/i).fill("Rohit Sharma");
  await pinComposer.fill(PIN_BODY);
  await page.getByRole("button", { name: /^post$/i }).click();

  await expect(page.getByRole("button", { name: `Pin 1: ${PIN_BODY}` })).toBeVisible({ timeout: 10_000 });
});
