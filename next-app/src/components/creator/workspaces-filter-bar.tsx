"use client";

import { useEffect, useState } from "react";
import { SearchField } from "@/components/ui/search-field";
import { FilterSelect } from "@/components/ui/filter-select";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { WORKSPACE_SORT_OPTIONS, WORKSPACE_STATUS_OPTIONS } from "@/lib/filter-options";
import type { WorkspaceClientOption } from "@/data-access/workspaces";

export interface WorkspacesFilterBarProps {
  clientOptions: WorkspaceClientOption[];
}

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The only Client Component on /workspaces — search/status/client/sort
 * controls that update URL search params (`q`, `status`, `client`,
 * `sort`). The actual list stays server-rendered (see page.tsx), reading
 * those same params back out on the next request.
 */
export function WorkspacesFilterBar({ clientOptions }: WorkspacesFilterBarProps) {
  const { getParam, setParam } = useUrlFilters();
  const [search, setSearch] = useState(() => getParam("q"));

  useEffect(() => {
    const timeout = setTimeout(() => setParam("q", search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when `search` itself changes
  }, [search]);

  const clientFilterOptions = [
    { label: "All Clients", value: "All" },
    ...clientOptions.map((client) => ({ label: client.name, value: client.id })),
  ];

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
        value={getParam("client", "All")}
        onChange={(value) => setParam("client", value)}
        options={clientFilterOptions}
        aria-label="Filter by client"
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
