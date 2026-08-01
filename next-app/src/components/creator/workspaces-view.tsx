"use client";

import { useState } from "react";
import { FolderKanban, Plus, SearchX } from "lucide-react";
import type { WorkspaceListItem, WorkspaceFilters } from "@/data-access/workspaces";
import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacesFilterBar } from "@/components/creator/workspaces-filter-bar";
import { WorkspaceTable } from "@/components/creator/workspace-table";
import { WorkspaceCard } from "@/components/creator/workspace-card";

export interface WorkspacesViewProps {
  workspaces: WorkspaceListItem[];
  filters: WorkspaceFilters;
}

export function WorkspacesView({ workspaces, filters }: WorkspacesViewProps) {
  const [activeTab, setActiveTab] = useState("All");

  const filteredWorkspaces = workspaces.filter((ws) => {
    if (activeTab === "All") return true;
    if (activeTab === "NEEDS_ATTENTION") {
      return ws.status === "CHANGES_REQUESTED" || ws.status === "FILES_PROCESSING";
    }
    if (activeTab === "IN_REVIEW") return ws.status === "IN_REVIEW" || ws.status === "READY_FOR_REVIEW";
    if (activeTab === "PAYMENT_PENDING") return ws.status === "PAYMENT_PENDING" || ws.status === "APPROVED";
    if (activeTab === "PAID") return ws.status === "PAID" || ws.status === "DELIVERED" || ws.status === "FILES_UNLOCKED";
    return true;
  });

  const filtersActive = filters.q.length > 0 || filters.status !== "All" || activeTab !== "All";
  const hasResults = filteredWorkspaces.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-text">Workspaces</h1>
          <p className="mt-1 text-sm text-secondary-text">
            Manage reviews, approvals, payments and secure delivery.
          </p>
        </div>
        <LinkButton href="/workspaces/new" variant="primary" size="md">
          <Plus size={16} aria-hidden="true" /> New Workspace
        </LinkButton>
      </div>

      <WorkspacesFilterBar activeTab={activeTab} onTabChange={setActiveTab} />

      {!hasResults ? (
        <EmptyState
          icon={filtersActive ? SearchX : FolderKanban}
          title={filtersActive ? "No workspaces match your search" : "No workspaces yet"}
          description={
            filtersActive
              ? "Try a different search term, or clear the status filter."
              : "Workspaces you create will appear here, ready to share as secure payment-gated review links."
          }
        />
      ) : (
        <>
          <WorkspaceTable
            workspaces={filteredWorkspaces}
            caption="Workspaces matching the current search and filters"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
            {filteredWorkspaces.map((workspace) => (
              <WorkspaceCard key={workspace.id} workspace={workspace} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
