import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeValidJpegFixture } from "../file-fixtures";
import { login, createWorkspaceViaWizard, uploadFileAndWaitReady, createReviewLink } from "./helpers";

/** Doodle/freehand annotation creation — see annotation-canvas.tsx / IMAGE_ANNOTATION_ARCHITECTURE.md. */
test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const WORKSPACE_TITLE = `RA Doodle Annotation ${RUN_ID}`;
const ANNOTATION_BODY = `See the highlighted area — ${RUN_ID}`;

let workspaceUrl = "";
let reviewLinkUrl = "";
let filePath = "";

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-ra-annotation-"));
  filePath = await writeValidJpegFixture(dir, `annotation-${RUN_ID}.jpg`);
});

test("creator uploads an image and generates a review link", async ({ page }) => {
  await login(page);
  workspaceUrl = await createWorkspaceViaWizard(page, { title: WORKSPACE_TITLE, amount: "5000" });
  await uploadFileAndWaitReady(page, workspaceUrl, filePath);
  reviewLinkUrl = await createReviewLink(page);
});

test("client draws a freehand annotation and submits it", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(reviewLinkUrl);

  await page.getByRole("button", { name: /^annotate$/i }).click();
  const canvas = page.locator('svg[viewBox="0 0 1 1"]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Annotation canvas did not render.");

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();

  await page.getByPlaceholder(/describe this annotation/i).fill(ANNOTATION_BODY);
  await page.getByRole("button", { name: /^submit annotation$/i }).click();

  await expect(page.getByText(ANNOTATION_BODY)).toBeVisible({ timeout: 10_000 });
});
