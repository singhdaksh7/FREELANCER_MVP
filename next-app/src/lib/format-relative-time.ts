const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Pure relative-time formatter: both instants are explicit arguments, so
 * it never reads the system clock. Mock data ships its own precomputed
 * display strings (e.g. "30 mins ago") for use in pages, precisely so
 * page output stays deterministic across builds/screenshots — this
 * helper exists for future use (real timestamps) and is covered by unit
 * tests with fixed dates.
 */
export function formatRelativeTime(fromIso: string, toIso: string): string {
  const diffSeconds = Math.round(
    (new Date(fromIso).getTime() - new Date(toIso).getTime()) / 1000,
  );

  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return relativeTimeFormatter.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }

  return relativeTimeFormatter.format(diffSeconds, "second");
}
