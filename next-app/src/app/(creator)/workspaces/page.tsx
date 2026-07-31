import type { Metadata } from "next";
import { FolderKanban, Plus, SearchX } from "lucide-react";
import { getWorkspaces } from "@/data-access/workspaces";
import { SectionHeader } from "@/components/ui/section-header";
import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacesFilterBar } from "@/components/creator/workspaces-filter-bar";
import { WorkspaceTable } from "@/components/creator/workspace-table";
import { WorkspaceCard } from "@/components/creator/workspace-card";
import type { RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Workspaces",
};

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { workspaces, filters } = await getWorkspaces(await searchParams);
  const filtersActive = filters.q.length > 0 || filters.status !== "All";
  const hasResults = workspaces.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Workspaces Directory"
        description="Manage all client project links, file security, and payment gates"
        action={
          <LinkButton href="/workspaces/new">
            <Plus size={16} aria-hidden="true" /> New Workspace
          </LinkButton>
        }
      />

      <WorkspacesFilterBar />

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
            workspaces={workspaces}
            caption="Workspaces matching the current search and filters"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
            {workspaces.map((workspace) => (
              <WorkspaceCard key={workspace.id} workspace={workspace} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
