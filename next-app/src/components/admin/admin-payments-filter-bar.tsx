"use client";

import { useEffect, useState } from "react";
import { SearchField } from "@/components/ui/search-field";
import { FilterSelect } from "@/components/ui/filter-select";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { PAYMENT_STATUS_OPTIONS } from "@/lib/filter-options";

const SEARCH_DEBOUNCE_MS = 350;

/** Search + status filter bar for /admin/payments. */
export function AdminPaymentsFilterBar() {
  const { getParam, setParam } = useUrlFilters();
  const [search, setSearch] = useState(() => getParam("q"));

  useEffect(() => {
    const timeout = setTimeout(() => setParam("q", search, ["All", "all", ""], ["page"]), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when `search` itself changes
  }, [search]);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-white p-4">
      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Search by workspace title, creator or client..."
        aria-label="Search payments"
      />
      <FilterSelect
        value={getParam("status", "All")}
        onChange={(value) => setParam("status", value, ["All", "all", ""], ["page"])}
        options={PAYMENT_STATUS_OPTIONS}
        aria-label="Filter by gateway status"
      />
    </div>
  );
}
