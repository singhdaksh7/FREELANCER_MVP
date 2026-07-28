"use client";

import { useMemo, useState } from "react";
import { FolderKanban, SearchX } from "lucide-react";
import type { Workspace, WorkspaceStatus } from "@/types";
import { SearchField } from "@/components/ui/search-field";
import { FilterSelect } from "@/components/ui/filter-select";
import { EmptyState } from "@/components/ui/empty-state";
import { matchesSearch } from "@/lib/search";
import { WorkspaceTable } from "./workspace-table";
import { WorkspaceCard } from "./workspace-card";

export interface WorkspaceExplorerProps {
  workspaces: Workspace[];
}

const STATUS_OPTIONS: { label: string; value: "All" | WorkspaceStatus }[] = [
  { label: "All Statuses", value: "All" },
  { label: "Draft", value: "Draft" },
  { label: "Preview Processing", value: "Preview Processing" },
  { label: "In Review", value: "In Review" },
  { label: "Changes Requested", value: "Changes Requested" },
  { label: "Approved", value: "Approved" },
  { label: "Payment Pending", value: "Payment Pending" },
  { label: "Paid", value: "Paid" },
];

/**
 * Owns search + status + client filtering over the (mock) workspace list.
 * Purely client-side filtering of already-loaded records — never mutates
 * `workspaces`, no localStorage/sessionStorage.
 */
export function WorkspaceExplorer({ workspaces }: WorkspaceExplorerProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"All" | WorkspaceStatus>("All");
  const [clientId, setClientId] = useState("All");

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const workspace of workspaces) seen.set(workspace.client.id, workspace.client.name);
    return [
      { label: "All Clients", value: "All" },
      ...Array.from(seen, ([value, label]) => ({ label, value })),
    ];
  }, [workspaces]);

  const filtered = workspaces.filter((workspace) => {
    const matchesQuery = matchesSearch(search, [workspace.title, workspace.client.name]);
    const matchesStatus = status === "All" || workspace.status === status;
    const matchesClient = clientId === "All" || workspace.client.id === clientId;
    return matchesQuery && matchesStatus && matchesClient;
  });

  const hasNoWorkspacesAtAll = workspaces.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface-card p-4">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search by project title or client name..."
          aria-label="Search workspaces"
        />
        <FilterSelect
          value={status}
          onChange={(value) => setStatus(value as "All" | WorkspaceStatus)}
          options={STATUS_OPTIONS}
          aria-label="Filter by status"
        />
        <FilterSelect
          value={clientId}
          onChange={setClientId}
          options={clientOptions}
          aria-label="Filter by client"
        />
      </div>

      {hasNoWorkspacesAtAll ? (
        <EmptyState
          icon={FolderKanban}
          title="No workspaces yet"
          description="Workspaces you create will appear here, ready to share as secure payment-gated review links."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No workspaces match your search"
          description="Try a different search term, or clear the status/client filters."
        />
      ) : (
        <>
          <WorkspaceTable workspaces={filtered} caption="Workspaces matching the current search and filters" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
            {filtered.map((workspace) => (
              <WorkspaceCard key={workspace.id} workspace={workspace} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
