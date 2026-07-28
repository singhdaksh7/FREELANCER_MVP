type ClassValue = string | number | null | false | undefined;

/**
 * Minimal className joiner (no external dependency).
 * Filters out falsy values and joins the rest with a single space.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
