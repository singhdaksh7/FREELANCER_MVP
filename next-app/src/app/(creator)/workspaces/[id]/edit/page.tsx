import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOwnedWorkspaceForEdit } from "@/data-access/workspaces";
import { getClientOptionsForCreator } from "@/data-access/clients";
import { SectionHeader } from "@/components/ui/section-header";
import { WorkspaceEditForm } from "@/components/creator/workspace-edit-form";

export const metadata: Metadata = {
  title: "Edit Workspace",
};

export default async function EditWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workspace, clientOptions] = await Promise.all([
    getOwnedWorkspaceForEdit(id),
    getClientOptionsForCreator(),
  ]);

  if (!workspace) notFound();

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={`Edit ${workspace.title}`} description="Update this workspace's project details and terms." />
      <WorkspaceEditForm workspace={workspace} clientOptions={clientOptions} />
    </div>
  );
}
