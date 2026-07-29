"use client";

import { useEffect, useState } from "react";
import { SearchField } from "@/components/ui/search-field";
import { useUrlFilters } from "@/hooks/use-url-filters";

const SEARCH_DEBOUNCE_MS = 350;

/** Search-only filter bar for /admin/users — see admin-workspaces-filter-bar.tsx for the fuller pattern. */
export function AdminUsersFilterBar() {
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
        placeholder="Search by creator name or email..."
        aria-label="Search creators"
      />
    </div>
  );
}
