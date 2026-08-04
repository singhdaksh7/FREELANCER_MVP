/**
 * Pure, Playwright-agnostic polling/retry state machine behind
 * e2e/helpers/wait-for-file-status.ts. Kept outside e2e/ (which vitest
 * doesn't scan — see vitest.config.ts's `include`) and free of any `Page`
 * dependency so it can be exercised with mocked deps in the regular unit
 * suite (`npm test`), without a real browser or the E2E database.
 *
 * Confirmed root cause this fixes: for a file whose DB/worker pipeline
 * reached READY in well under a second, the old helper still timed out
 * after the full 90s. Two compounding bugs in the observation loop: (1) a
 * reload + tab-reselect were kicked off and then the *pre-reload* status
 * value was returned in that same step, instead of waiting for the
 * reload+reselect to fully resolve before the next read; and (2) the
 * moment the timeout elapsed, it reported failure immediately using
 * whatever was last observed, even though — per the post-timeout
 * diagnostic snapshot — the very next DOM read would have shown "Ready".
 * `pollForStatus` fixes both: every iteration re-reads fresh (never a
 * value captured before a reload), and one more fresh read is taken right
 * at the timeout boundary before a failure is ever reported.
 */

export type FileStatusLabel = "Pending" | "Uploading" | "Uploaded" | "Processing" | "Ready" | "Failed" | "Deleted";

// Matches FileCard's STATUS_LABELS mapping (src/components/creator/file-card.tsx)
// exactly — this deliberately does not invent its own label set, since the
// FileStatus badge already is a reliable semantic status element and
// production code must not change just to serve this helper.
const KNOWN_STATUS_LABELS: readonly FileStatusLabel[] = [
  "Pending",
  "Uploading",
  "Uploaded",
  "Processing",
  "Ready",
  "Failed",
  "Deleted",
];

/** Normalizes whitespace and validates against the known set of rendered FileCard status badge labels. Anything else (including absence) is `null`. */
export function normalizeStatus(raw: string | null | undefined): FileStatusLabel | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return (KNOWN_STATUS_LABELS as readonly string[]).includes(trimmed) ? (trimmed as FileStatusLabel) : null;
}

/** Escapes a value for safe interpolation into a `[attr="..."]` CSS attribute selector. */
export function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export interface ObservationEntry {
  /** Milliseconds since polling started. */
  atMs: number;
  status: FileStatusLabel | null;
}

export interface PollForStatusDeps {
  /**
   * Fresh read of the currently-rendered status — implementations must
   * re-locate the file card on every call (never reuse a cached
   * Locator/ElementHandle result across calls), and must resolve to
   * `null` rather than throw when the card isn't present/rendered yet.
   */
  readStatus: () => Promise<FileStatusLabel | null>;
  /**
   * Fully resolves a reload + (optional) tab-reselect + wait-for-card
   * cycle before returning. The caller never reads status until this
   * promise settles — this is what prevents returning a pre-reload value.
   */
  reloadAndResync: () => Promise<void>;
  /** Sleeps between polls — injectable so tests run without real timers. */
  sleep: (ms: number) => Promise<void>;
  /** Monotonic clock — injectable so tests are deterministic. */
  now: () => number;
}

export interface PollForStatusOptions {
  expectedStatus: string;
  timeoutMs: number;
  gracePeriodMs: number;
  reloadCooldownMs: number;
  intervalsMs: readonly number[];
  /** Caps how many entries `history` retains (keeps the most recent ones). */
  historyLimit: number;
}

export interface PollForStatusResult {
  success: boolean;
  finalStatus: FileStatusLabel | null;
  /** True when success only came from the post-timeout final-race read. */
  recoveredOnFinalRead: boolean;
  /** True when polling stopped early because status was "Failed" while a different status was expected. */
  failedEarly: boolean;
  history: ObservationEntry[];
}

/**
 * Repeatedly reads the current status via `deps.readStatus` until it
 * matches `expectedStatus`, a `"Failed"` status is observed while
 * expecting something else (fails fast rather than waiting out the full
 * timeout), or `timeoutMs` elapses — in which case one final fresh read is
 * taken before reporting failure (the "final-race protection" that fixes
 * the confirmed false-timeout defect).
 */
export async function pollForStatus(
  deps: PollForStatusDeps,
  options: PollForStatusOptions,
): Promise<PollForStatusResult> {
  const { expectedStatus, timeoutMs, gracePeriodMs, reloadCooldownMs, intervalsMs, historyLimit } = options;
  const startedAt = deps.now();
  const history: ObservationEntry[] = [];

  function record(status: FileStatusLabel | null): void {
    history.push({ atMs: deps.now() - startedAt, status });
    if (history.length > historyLimit) history.shift();
  }

  let lastReloadAt = startedAt;
  let intervalIndex = 0;

  for (;;) {
    const status = await deps.readStatus();
    record(status);

    if (status === expectedStatus) {
      return { success: true, finalStatus: status, recoveredOnFinalRead: false, failedEarly: false, history };
    }

    if (status === "Failed" && expectedStatus !== "Failed") {
      return { success: false, finalStatus: status, recoveredOnFinalRead: false, failedEarly: true, history };
    }

    const now = deps.now();
    const elapsed = now - startedAt;

    if (elapsed >= timeoutMs) {
      const finalStatus = await deps.readStatus();
      record(finalStatus);
      if (finalStatus === expectedStatus) {
        return { success: true, finalStatus, recoveredOnFinalRead: true, failedEarly: false, history };
      }
      return { success: false, finalStatus, recoveredOnFinalRead: false, failedEarly: false, history };
    }

    if (elapsed > gracePeriodMs && now - lastReloadAt > reloadCooldownMs) {
      lastReloadAt = deps.now();
      await deps.reloadAndResync();
      // Loop straight back to a fresh read now that reload+resync has
      // fully resolved — never fall through to returning a value read
      // before this reload was kicked off.
      continue;
    }

    const interval = intervalsMs[Math.min(intervalIndex, intervalsMs.length - 1)];
    intervalIndex += 1;
    const remaining = timeoutMs - elapsed;
    await deps.sleep(Math.min(interval, Math.max(remaining, 0)));
  }
}
