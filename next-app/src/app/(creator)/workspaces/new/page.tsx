import type { Metadata } from "next";
import { getClientOptionsForCreator } from "@/data-access/clients";
import { SectionHeader } from "@/components/ui/section-header";
import { WorkspaceWizard } from "@/components/creator/workspace-wizard";

export const metadata: Metadata = {
  title: "New Workspace",
};

export default async function NewWorkspacePage() {
  const clientOptions = await getClientOptionsForCreator();

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Create Workspace"
        description="Set up a new project workspace for a client in five steps."
      />
      <WorkspaceWizard clientOptions={clientOptions} />
    </div>
  );
}
