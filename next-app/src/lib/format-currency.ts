const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * Formats a rupee amount using Indian digit grouping (e.g. ₹2,50,000),
 * replacing the original app's locale-dependent `.toLocaleString()` calls
 * with a deterministic, explicit-locale formatter. `null` (an
 * APPROVAL_ONLY/PREVIEW_ONLY workspace with no price set — see
 * DELIVERY_MODES.md) renders as a dash rather than ₹0, since those are not
 * the same thing.
 */
export function formatINR(amount: number | null): string {
  return amount === null ? "—" : inrFormatter.format(amount);
}
