/** Trims and lowercases an email so storage/lookup is consistently case-insensitive. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
