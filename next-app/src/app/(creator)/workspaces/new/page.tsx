import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/section-header";
import { WorkspaceWizard } from "@/components/creator/workspace-wizard";
import { getOwnedDraftWorkspace } from "@/data-access/workspaces";
import { getWorkspaceFiles } from "@/data-access/files";
import { getUploadLimits } from "@/storage/storage-config";

export const metadata: Metadata = {
  title: "New Workspace",
};

/**
 * Resolves the `?draft=<id>&step=<n>` recovery URL (see
 * createWorkspaceDraftAction). `getOwnedDraftWorkspace` returns `null` for
 * a missing, not-owned, or no-longer-DRAFT id — that's treated identically
 * to "no draft param at all," so a stale/foreign/deleted draft id silently
 * falls back to a fresh Step 1 rather than ever leaking another creator's
 * draft or erroring loudly.
 */
export default async function NewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; step?: string }>;
}) {
  const { draft: draftId, step: stepParam } = await searchParams;

  const draft = draftId ? await getOwnedDraftWorkspace(draftId) : null;
  const files = draft ? await getWorkspaceFiles(draft.id) : [];
  const uploadLimits = getUploadLimits();

  // A resumed draft may legitimately point at any step, including Step 1
  // (reached via the wizard's own "Back" button — see goToStep in
  // workspace-wizard.tsx), so every step 1-5 is honored once a real,
  // owned draft has resolved. Without a resolved draft there is nothing
  // to resume into past Step 1 — including for a stale/foreign/deleted
  // draft id, which must fall back exactly like "no draft param at all"
  // (see getOwnedDraftWorkspace's doc comment) rather than rendering a
  // Step 2+ section with no workspaceId behind it.
  const requestedStep = stepParam ? Number.parseInt(stepParam, 10) : NaN;
  const initialStep = !draft
    ? 1
    : Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 5
      ? requestedStep
      : 2;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Create Workspace"
        description="Set up a new project workspace for a client in five steps."
      />
      <WorkspaceWizard draft={draft} files={files} uploadLimits={uploadLimits} initialStep={initialStep} />
    </div>
  );
}
