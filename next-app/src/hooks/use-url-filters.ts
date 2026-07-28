"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Reads/writes filter state as URL search params, so list filters stay
 * shareable/bookmarkable and every list page can stay a Server Component
 * that reads `searchParams` — only this small hook (and the filter
 * controls that use it) needs to be a Client Component.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getParam = useCallback(
    (key: string, fallback = "") => searchParams.get(key) ?? fallback,
    [searchParams],
  );

  const setParam = useCallback(
    (key: string, value: string, emptyValues: readonly string[] = ["All", "all", ""]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && !emptyValues.includes(value)) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { getParam, setParam };
}
