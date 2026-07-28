const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Formats an ISO date (YYYY-MM-DD) as e.g. "20 Jul 2026". Interprets the
 * date in UTC so the output is stable regardless of the machine's local
 * timezone (important for deterministic builds/screenshots).
 */
export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Payment `date` is `null` until the payment settles — renders as "Pending". */
export function formatPaymentDate(isoDate: string | null): string {
  return isoDate ? formatDate(isoDate) : "Pending";
}
