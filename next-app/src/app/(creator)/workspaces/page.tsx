import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { WORKSPACES } from "@/data/mock";
import { SectionHeader } from "@/components/ui/section-header";
import { LinkButton } from "@/components/ui/link-button";
import { WorkspaceExplorer } from "@/components/creator/workspace-explorer";

export const metadata: Metadata = {
  title: "Workspaces",
};

export default function WorkspacesPage() {
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
      <WorkspaceExplorer workspaces={WORKSPACES} />
    </div>
  );
}
