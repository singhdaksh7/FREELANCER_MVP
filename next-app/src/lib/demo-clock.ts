/**
 * Fixed reference "today" for the demo dataset (matches the most recent
 * dates in the mock data). Date-range filters compare against this
 * constant instead of `Date.now()` so filtered results — and any
 * screenshot taken of them — stay identical on every run.
 */
export const DEMO_TODAY = "2026-07-28";

/** ISO date (YYYY-MM-DD) `daysAgo` days before DEMO_TODAY. Plain UTC arithmetic — no system clock involved. */
export function demoDaysAgo(daysAgo: number): string {
  const reference = new Date(`${DEMO_TODAY}T00:00:00Z`);
  reference.setUTCDate(reference.getUTCDate() - daysAgo);
  return reference.toISOString().slice(0, 10);
}
