import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOwnedWorkspaceDetail } from "@/data-access/workspaces";
import { getReviewPortalWorkspaceData } from "@/data-access/review-portal-data";
import { getAuthenticatedCreator } from "@/data-access/auth";
import { ReviewPortal } from "@/components/review/review-portal";

export const metadata: Metadata = {
  title: "Preview Client View",
};

/**
 * Creator-authenticated, read-only render of the exact review UI a client
 * sees for this workspace — see requirement "Preview Client View" in the
 * Phase 8 product-simplification spec. `getOwnedWorkspaceDetail` performs
 * the ownership check (redirects to /login if unauthenticated, returns
 * null for a nonexistent OR not-owned workspace — both render the same
 * not-found page, so a creator can never distinguish "doesn't exist" from
 * "belongs to someone else," and can never see another creator's
 * workspace this way).
 *
 * `readOnlyPreview` on ReviewPortal disables every mutating action
 * (approve, request changes, comment, pin, annotate, pay, download
 * originals) — this route never creates a Payment or WorkspaceApproval
 * row. The real client-facing flow at /review/[token] is entirely
 * separate and untouched by this route.
 */
export default async function WorkspacePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workspace, creator] = await Promise.all([getOwnedWorkspaceDetail(id), getAuthenticatedCreator()]);

  if (!workspace || !creator) notFound();

  const { files, comments, activeChangeRequest, approval } = await getReviewPortalWorkspaceData(workspace.id);

  return (
    <ReviewPortal
      token=""
      workspace={{
        title: workspace.title,
        amount: workspace.amount,
        currency: workspace.currency,
        creatorName: creator.name,
        client: { name: workspace.clientName },
        deliveryMode: workspace.deliveryMode,
        status: workspace.status,
      }}
      files={files}
      comments={comments}
      activeChangeRequest={activeChangeRequest}
      approval={approval}
      readOnlyPreview
      workspaceId={workspace.id}
    />
  );
}
