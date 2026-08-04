import { type Page, type TestInfo } from "@playwright/test";
import {
  escapeAttributeValue,
  normalizeStatus,
  pollForStatus,
  type FileStatusLabel,
  type PollForStatusResult,
} from "../../scripts/e2e-file-status";

/**
 * Shared wait for a file card's user-visible status to reach a terminal (or
 * any expected) value. Centralizes what used to be duplicated ad hoc across
 * e2e/uploads, e2e/review, e2e/payment/helpers.ts and
 * e2e/requirements-alignment/helpers.ts (each with its own timeout and, in
 * the two helpers.ts files, near-identical copy-pasted implementations).
 *
 * The actual polling/retry/final-race-protection logic lives in
 * scripts/e2e-file-status.ts (`pollForStatus`) — this file only wires that
 * pure state machine up to a real Playwright `Page`: a fresh Locator is
 * built from `fileCardSelector` on every single read (never a cached
 * ElementHandle/Locator carried across a `page.reload()`), and a reload
 * cycle always fully resolves — including re-selecting the Files tab and
 * waiting for the matching card to become visible again — before the next
 * read happens.
 */

export interface WaitForFileStatusOptions {
  fileName: string;
  expectedStatus: string;
  /** Total time budget. Default 90s — matches the worst-case cold-start wait uploads.spec.ts already needed. */
  timeoutMs?: number;
  /**
   * Click back onto the Files tab after each reload fallback. Needed
   * whenever the file list lives behind a tab rather than being the whole
   * page (which is every real usage today).
   */
  reselectFilesTab?: boolean;
  /**
   * Optional: fetch a sanitized DB-side status string for diagnostics only.
   * Never used as the pass/fail signal — the final assertion always stays
   * on user-visible UI state.
   */
  getDatabaseStatus?: () => Promise<string | null>;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const GRACE_PERIOD_MS = 15_000;
// Minimum time between reload fallbacks. Without this, once the grace
// period elapses, a fast poll cadence would fire a fresh page.reload() on
// every single tick — and if that cadence is faster than the reloaded
// page's React hydration, a tab-reselect click can land before any handler
// is attached and silently no-op.
const RELOAD_COOLDOWN_MS = 8_000;
const POLL_INTERVALS_MS = [500, 1000, 1500, 2500, 5000];
// How long a single read waits for the matching file card to exist/render
// before concluding it's genuinely absent right now — covers both the
// first read (before any card has ever rendered) and the moment right
// after a reload/tab-reselect, without ever reading the DOM immediately
// after kicking that reload off.
const CARD_VISIBLE_TIMEOUT_MS = 5_000;
const HISTORY_LIMIT = 40;

function fileCardSelector(fileName: string): string {
  return `[data-testid="file-card"][data-file-name="${escapeAttributeValue(fileName)}"]`;
}

export async function waitForFileStatus(
  page: Page,
  options: WaitForFileStatusOptions,
  testInfo?: TestInfo,
): Promise<void> {
  const { fileName, expectedStatus, timeoutMs = DEFAULT_TIMEOUT_MS, reselectFilesTab = false, getDatabaseStatus } = options;
  const selector = fileCardSelector(fileName);

  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  const onRequestFailed = (request: import("@playwright/test").Request) => {
    failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown error"}`);
  };
  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  async function readStatus(): Promise<FileStatusLabel | null> {
    // A brand-new Locator every call — Locators re-query the live DOM on
    // every use, so this never risks resolving against a pre-reload
    // element. The short waitFor lets a render that's genuinely in
    // flight (the app's own client-side poll, or a just-finished
    // reload+tab-reselect) actually paint before concluding "absent".
    const card = page.locator(selector);
    const visible = await card
      .waitFor({ state: "visible", timeout: CARD_VISIBLE_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (!visible) return null;
    const raw = await card.getByTestId("file-status").textContent().catch(() => null);
    return normalizeStatus(raw);
  }

  async function reloadAndResync(): Promise<void> {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    if (reselectFilesTab) {
      const filesTab = page.getByRole("tab", { name: /^files$/i });
      await filesTab.waitFor({ state: "visible" }).catch(() => {});
      await filesTab.click().catch(() => {});
    }
    // Never read status immediately after initiating reload/tab click —
    // wait for the matching card to actually be visible again first, so
    // the very next read this feeds into is guaranteed post-resync.
    await page
      .locator(selector)
      .waitFor({ state: "visible", timeout: CARD_VISIBLE_TIMEOUT_MS })
      .catch(() => {});
  }

  let result: PollForStatusResult;
  try {
    result = await pollForStatus(
      {
        readStatus,
        reloadAndResync,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
      },
      {
        expectedStatus,
        timeoutMs,
        gracePeriodMs: GRACE_PERIOD_MS,
        reloadCooldownMs: RELOAD_COOLDOWN_MS,
        intervalsMs: POLL_INTERVALS_MS,
        historyLimit: HISTORY_LIMIT,
      },
    );
  } finally {
    page.off("console", onConsole);
    page.off("requestfailed", onRequestFailed);
  }

  if (result.success) return;

  if (testInfo) {
    await attachDiagnostics(page, page.locator(selector), testInfo, {
      fileName,
      expectedStatus,
      reselectFilesTab,
      result,
      consoleErrors,
      failedRequests,
      getDatabaseStatus,
    });
  }

  const message = result.failedEarly
    ? `File "${fileName}" reached status "Failed" while waiting for status "${expectedStatus}".`
    : `Waiting for file "${fileName}" to reach status "${expectedStatus}" (last observed: "${result.finalStatus ?? "not rendered"}").`;
  throw new Error(message);
}

interface DiagnosticsContext {
  fileName: string;
  expectedStatus: string;
  reselectFilesTab: boolean;
  result: PollForStatusResult;
  consoleErrors: string[];
  failedRequests: string[];
  getDatabaseStatus?: () => Promise<string | null>;
}

/**
 * Attaches safe, non-secret diagnostics to the Playwright report on a real
 * failure. Never includes cookies, tokens, signed URLs, or credentials —
 * only UI state, DOM structure, and console/network activity.
 */
async function attachDiagnostics(
  page: Page,
  card: ReturnType<Page["locator"]>,
  testInfo: TestInfo,
  ctx: DiagnosticsContext,
): Promise<void> {
  const filesTabSelected = await page
    .getByRole("tab", { name: /^files$/i })
    .getAttribute("aria-selected")
    .catch(() => null);

  const summary: Record<string, unknown> = {
    fileName: ctx.fileName,
    expectedStatus: ctx.expectedStatus,
    lastObservedStatus: ctx.result.finalStatus,
    failedEarly: ctx.result.failedEarly,
    reselectFilesTabOption: ctx.reselectFilesTab,
    filesTabSelected,
    currentUrl: page.url(),
    observationHistory: ctx.result.history.map((entry) => `${entry.atMs}ms ${entry.status ?? "(not rendered)"}`),
  };

  if (ctx.getDatabaseStatus) {
    try {
      summary.databaseStatus = await ctx.getDatabaseStatus();
    } catch (e) {
      summary.databaseStatusError = e instanceof Error ? e.message : String(e);
    }
  }

  const cardHtml = await card.evaluate((el) => el.outerHTML).catch(() => null);

  await testInfo.attach("wait-for-file-status-summary.json", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });

  if (cardHtml) {
    await testInfo.attach("file-card.html", { body: cardHtml, contentType: "text/html" });
  }

  if (ctx.consoleErrors.length > 0) {
    await testInfo.attach("console-errors.txt", {
      body: ctx.consoleErrors.join("\n"),
      contentType: "text/plain",
    });
  }

  if (ctx.failedRequests.length > 0) {
    await testInfo.attach("failed-requests.txt", {
      body: ctx.failedRequests.join("\n"),
      contentType: "text/plain",
    });
  }

  const screenshot = await page.screenshot({ fullPage: true }).catch(() => null);
  if (screenshot) {
    await testInfo.attach("timeout-screenshot.png", { body: screenshot, contentType: "image/png" });
  }
}
