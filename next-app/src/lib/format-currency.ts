const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * Formats a rupee amount using Indian digit grouping (e.g. ₹2,50,000),
 * replacing the original app's locale-dependent `.toLocaleString()` calls
 * with a deterministic, explicit-locale formatter.
 */
export function formatINR(amount: number): string {
  return inrFormatter.format(amount);
}
