import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/section-header";
import { WorkspaceWizard } from "@/components/creator/workspace-wizard";

export const metadata: Metadata = {
  title: "New Workspace",
};

export default function NewWorkspacePage() {
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Create Workspace"
        description="Set up a new project workspace for a client in five steps."
      />
      <WorkspaceWizard />
    </div>
  );
}
