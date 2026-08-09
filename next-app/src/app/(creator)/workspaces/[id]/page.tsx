import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Share2 } from "lucide-react";
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
import { WorkflowProgress } from "@/components/creator/workflow-progress";
import { ApprovalCard, PaymentCardDetail, DeliveryCard } from "@/components/creator/workspace-context-cards";
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

  if (!workspace) notFound();

  const files = await getWorkspaceFiles(workspace.id);
  const uploadLimits = getUploadLimits();
  const comments = await getOwnedReviewCommentThreads(workspace.id);
  const activeChangeRequest = await getActiveChangeRequest(workspace.id);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-secondary-text">
          <Link href="/workspaces" className="flex items-center gap-1 hover:text-primary-blue">
            <ArrowLeft size={14} /> Back to Workspaces
          </Link>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-3">
              <h1 className="text-2xl font-black text-primary-text">{workspace.title}</h1>
              <StatusBadge status={workspaceStatusLabel(workspace.status)} />
            </div>
            <p className="text-sm text-secondary-text font-medium">Client: <strong>{workspace.clientName}</strong></p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-primary-text">{formatINR(workspace.amount)}</div>
            <div className="text-xs text-muted-text">
              Due {workspace.dueDate ? formatDate(workspace.dueDate) : "date not set"}
            </div>
          </div>
        </div>

        {/* Primary Header Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/workspaces/${workspace.id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-navy px-4 py-2 text-xs font-bold text-white hover:bg-deep-navy"
            >
              <ExternalLink size={14} aria-hidden="true" /> Preview Client View
            </Link>
          </div>

          <WorkspaceActions
            workspaceId={workspace.id}
            workspaceTitle={workspace.title}
            canCancel={workspace.canCancel}
            canDelete={workspace.canDelete}
            financiallyLocked={workspace.financiallyLocked}
            canCloseForReview={workspace.canCloseForReview}
          />
        </div>
      </div>

      {/* Workflow Horizontal Progress Bar */}
      <WorkflowProgress status={workspace.status} deliveryMode={workspace.deliveryMode} />

      {/* Two Column Layout: Main Column + Right Contextual Column */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <WorkspaceDetailTabs
            workspace={workspace}
            files={files}
            uploadLimits={uploadLimits}
            comments={comments}
            activeChangeRequest={activeChangeRequest}
          />
        </div>

        {/* Contextual Column */}
        <div className="flex flex-col gap-5">
          <ReviewLinkPanel
            workspaceId={workspace.id}
            workspaceTitle={workspace.title}
            reviewLink={workspace.reviewLink}
          />

          <ApprovalCard status={workspace.status} />

          <PaymentCardDetail amount={workspace.amount} currency={workspace.currency} status={workspace.status} />

          <DeliveryCard status={workspace.status} deliveryMode={workspace.deliveryMode} />
        </div>
      </div>

      <FlashToast />
    </div>
  );
}
