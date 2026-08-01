"use client";

import { useEffect, useState } from "react";
import { SearchField } from "@/components/ui/search-field";
import { FilterSelect } from "@/components/ui/filter-select";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { WORKSPACE_SORT_OPTIONS, WORKSPACE_STATUS_OPTIONS } from "@/lib/filter-options";

const SEARCH_DEBOUNCE_MS = 350;

export interface WorkspacesFilterBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: "All", label: "All" },
  { id: "NEEDS_ATTENTION", label: "Needs Attention" },
  { id: "IN_REVIEW", label: "In Review" },
  { id: "PAYMENT_PENDING", label: "Awaiting Payment" },
  { id: "PAID", label: "Completed" },
];

export function WorkspacesFilterBar({ activeTab, onTabChange }: WorkspacesFilterBarProps) {
  const { getParam, setParam } = useUrlFilters();
  const [search, setSearch] = useState(() => getParam("q"));

  useEffect(() => {
    const timeout = setTimeout(() => setParam("q", search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search, setParam]);

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-line pb-2 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-primary-blue text-white"
                  : "bg-card text-secondary-text hover:bg-app-bg"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-card p-4 shadow-sm">
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
    </div>
  );
}
