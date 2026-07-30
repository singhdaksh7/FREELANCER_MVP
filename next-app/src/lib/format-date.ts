const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/**
 * Formats an ISO date (YYYY-MM-DD) or full ISO datetime as e.g.
 * "20 Jul 2026". Interprets the value in UTC so the output is stable
 * regardless of the machine's local timezone (important for
 * deterministic builds/screenshots).
 */
export function formatDate(isoDateOrDateTime: string): string {
  const iso = isoDateOrDateTime.includes("T") ? isoDateOrDateTime : `${isoDateOrDateTime}T00:00:00Z`;
  return dateFormatter.format(new Date(iso));
}

/** Formats a full ISO datetime as e.g. "20 Jul 2026, 08:30 am". */
export function formatDateTime(isoDateTime: string): string {
  return dateTimeFormatter.format(new Date(isoDateTime));
}

/** Payment `date` is `null` until the payment settles — renders as "Pending". */
export function formatPaymentDate(isoDate: string | null): string {
  return isoDate ? formatDate(isoDate) : "Pending";
}
