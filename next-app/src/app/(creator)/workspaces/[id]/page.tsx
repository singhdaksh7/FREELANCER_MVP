import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOwnedWorkspaceDetail } from "@/data-access/workspaces";
import { getWorkspaceFiles } from "@/data-access/files";
import { getOwnedReviewCommentThreads } from "@/data-access/review-comments";
import { getActiveChangeRequest } from "@/data-access/change-requests";
import { getUploadLimits } from "@/storage/storage-config";
import { StatusBadge } from "@/components/ui/status-badge";
import { FlashToast } from "@/components/ui/flash-toast";
import { WorkspaceActions } from "@/components/creator/workspace-actions";
import { ReviewLinkPanel } from "@/components/creator/review-link-panel";
import { WorkspaceDetailTabs } from "@/components/creator/workspace-detail-tabs";
import { formatINR } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";
import { workspaceStatusLabel } from "@/lib/status-labels";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const workspace = await getOwnedWorkspaceDetail(id);
  return { title: workspace ? workspace.title : "Workspace" };
}

export default async function WorkspaceDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getOwnedWorkspaceDetail(id);

  // Never distinguishes "doesn't exist" from "belongs to another creator" — both render the same not-found page.
  if (!workspace) notFound();

  const files = await getWorkspaceFiles(workspace.id);
  const uploadLimits = getUploadLimits();
  const comments = await getOwnedReviewCommentThreads(workspace.id);
  const activeChangeRequest = await getActiveChangeRequest(workspace.id);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-ink">{workspace.title}</h1>
              <StatusBadge status={workspaceStatusLabel(workspace.status)} />
            </div>
            <p className="text-sm text-ink-muted">
              {workspace.client.name}
              {workspace.client.company ? ` · ${workspace.client.company}` : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold text-ink">{formatINR(workspace.amount)}</div>
            <div className="text-xs text-ink-muted">
              Due {workspace.dueDate ? formatDate(workspace.dueDate) : "date not set"}
            </div>
          </div>
        </div>

        <WorkspaceActions
          workspaceId={workspace.id}
          workspaceTitle={workspace.title}
          canCancel={workspace.canCancel}
          canDelete={workspace.canDelete}
          financiallyLocked={workspace.financiallyLocked}
          canReleaseFiles={workspace.canReleaseFiles}
          canCloseForReview={workspace.canCloseForReview}
        />
      </div>

      <ReviewLinkPanel
        workspaceId={workspace.id}
        workspaceTitle={workspace.title}
        reviewLink={workspace.reviewLink}
      />

      <WorkspaceDetailTabs
        workspace={workspace}
        files={files}
        uploadLimits={uploadLimits}
        comments={comments}
        activeChangeRequest={activeChangeRequest}
      />
      <FlashToast />
    </div>
  );
}
