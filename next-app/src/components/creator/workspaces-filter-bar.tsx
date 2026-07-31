"use client";

import { useEffect, useState } from "react";
import { SearchField } from "@/components/ui/search-field";
import { FilterSelect } from "@/components/ui/filter-select";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { WORKSPACE_SORT_OPTIONS, WORKSPACE_STATUS_OPTIONS } from "@/lib/filter-options";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The only Client Component on /workspaces — search/status/sort controls
 * that update URL search params (`q`, `status`, `sort`). The actual list
 * stays server-rendered (see page.tsx), reading those same params back
 * out on the next request. `q` already matches against clientName (see
 * getWorkspaces), so there is no separate client filter.
 */
export function WorkspacesFilterBar() {
  const { getParam, setParam } = useUrlFilters();
  const [search, setSearch] = useState(() => getParam("q"));

  useEffect(() => {
    const timeout = setTimeout(() => setParam("q", search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when `search` itself changes
  }, [search]);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface-card p-4">
      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Search by project title or client name..."
        aria-label="Search workspaces"
      />
      <FilterSelect
        value={getParam("status", "All")}
        onChange={(value) => setParam("status", value)}
        options={WORKSPACE_STATUS_OPTIONS}
        aria-label="Filter by status"
      />
      <FilterSelect
        value={getParam("sort", "recent")}
        onChange={(value) => setParam("sort", value, ["all", ""])}
        options={WORKSPACE_SORT_OPTIONS}
        aria-label="Sort workspaces"
      />
    </div>
  );
}
