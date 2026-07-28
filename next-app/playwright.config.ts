import { defineConfig, devices } from "@playwright/test";

const PORT = 4500;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Visual regression config for the creator screens migrated in Phase 2.
 * Runs against a production build (`next build && next start`) rather
 * than `next dev`, so there's no dev-mode overlay/HMR chrome in
 * screenshots and output is as close as possible to what ships.
 */
export default defineConfig({
  testDir: "./e2e/visual",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      // A couple of pixels of anti-aliasing drift is expected between
      // runs/machines; this keeps the check meaningful without being flaky.
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start -- -p " + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
});
