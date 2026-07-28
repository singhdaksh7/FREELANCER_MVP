import type { Page } from "@playwright/test";

/**
 * 1x1 transparent PNG, used to stub every remote avatar/preview image
 * (all currently hotlinked from images.unsplash.com in the mock data).
 * Without this, screenshots would depend on network access and on
 * Unsplash's CDN returning byte-identical images, which the "no
 * non-deterministic screenshots" requirement rules out.
 */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function stubRemoteImages(page: Page): Promise<void> {
  await page.route("https://images.unsplash.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PNG });
  });
}

/**
 * Navigates and waits for the page + its fonts to finish settling before a
 * screenshot is taken. Deliberately avoids `networkidle` (Playwright's own
 * docs warn it against pages with any lingering background connections —
 * it hung here) in favor of waiting on concrete, meaningful signals.
 */
export async function gotoAndStabilize(page: Page, path: string): Promise<void> {
  await stubRemoteImages(page);
  await page.goto(path, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}
