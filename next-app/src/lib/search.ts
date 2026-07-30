export function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * True if `term` is empty, or if any of `fields` contains it
 * (case-insensitive). Used to filter mock records client-side without
 * mutating the underlying data.
 */
export function matchesSearch(term: string, fields: (string | undefined)[]): boolean {
  const normalized = normalizeSearchTerm(term);
  if (!normalized) return true;
  return fields.some((field) => field?.toLowerCase().includes(normalized));
}
