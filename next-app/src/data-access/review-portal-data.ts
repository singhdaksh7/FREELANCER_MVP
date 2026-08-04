import "server-only";
import { getReviewableFiles, type ReviewableFile } from "./review-files";
import { getCreatorPreviewFiles } from "./creator-preview-files";
import { getReviewCommentThreads, type ReviewCommentThreadItem } from "./review-comments";
import { getActiveChangeRequest, type ActiveChangeRequest } from "./change-requests";
import { getApprovalSummary, type ApprovalSummary } from "./approvals";

export interface ReviewPortalWorkspaceData {
  files: ReviewableFile[];
  comments: ReviewCommentThreadItem[];
  activeChangeRequest: ActiveChangeRequest | null;
  approval: ApprovalSummary | null;
}

/**
 * Shared comments/change-request/approval loading for the ReviewPortal
 * component — used by both the public token-authorized review page
 * (/review/[token]) and the creator-authenticated read-only "Preview Client
 * View" (/workspaces/[id]/preview), so the two surfaces can never drift in
 * what non-file data the portal renders. Callers are responsible for their
 * own authorization before calling this — it takes only a workspaceId and
 * performs no ownership/token checks itself.
 *
 * `files` is deliberately NOT shared between the two callers: the public
 * page must only ever see submitted (`submittedAt != null`) versions (see
 * `getReviewableFiles`), while the creator's own Preview Client View must
 * show the current READY version of every file immediately, even before
 * it's ever been submitted (see `getCreatorPreviewFiles`). Use
 * `getReviewPortalWorkspaceData` for the public page and
 * `getCreatorReviewPortalData` for the creator page — never swap them.
 */
async function getSharedReviewPortalData(workspaceId: string) {
  const [comments, activeChangeRequest, approval] = await Promise.all([
    getReviewCommentThreads(workspaceId),
    getActiveChangeRequest(workspaceId),
    getApprovalSummary(workspaceId),
  ]);
  return { comments, activeChangeRequest, approval };
}

/** Public `/review/[token]` data source — only ever submitted file versions. Caller must have already authorized the review token. */
export async function getReviewPortalWorkspaceData(workspaceId: string): Promise<ReviewPortalWorkspaceData> {
  const [files, shared] = await Promise.all([getReviewableFiles({ workspaceId }), getSharedReviewPortalData(workspaceId)]);
  return { files, ...shared };
}

/**
 * Creator-authenticated `/workspaces/[id]/preview` ("Preview Client View")
 * data source — the current READY version of every file, submitted or not.
 * Enforces its own ownership check (via `getCreatorPreviewFiles` ->
 * `requireOwnedWorkspace`); callers don't need to separately re-check
 * ownership for the files themselves, but should still have already
 * resolved/authorized the workspace for any other data they render.
 */
export async function getCreatorReviewPortalData(workspaceId: string): Promise<ReviewPortalWorkspaceData> {
  const [files, shared] = await Promise.all([getCreatorPreviewFiles(workspaceId), getSharedReviewPortalData(workspaceId)]);
  return { files, ...shared };
}
