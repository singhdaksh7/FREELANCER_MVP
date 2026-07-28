export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Free-text query param: trimmed, capped to a sane length so it can't be used to build oversized queries. */
export function parseQueryParam(params: RawSearchParams, key: string): string {
  return firstValue(params[key]).trim().slice(0, 120);
}

/** Only accepts one of `allowed`; any unsupported value silently falls back to `fallback` rather than erroring. */
export function parseEnumParam<T extends string>(
  params: RawSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = firstValue(params[key]);
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}
