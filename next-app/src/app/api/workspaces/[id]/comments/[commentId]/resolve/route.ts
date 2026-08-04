import { NextRequest, NextResponse } from "next/server";
import { resolveReviewComment } from "@/data-access/review-comments";
import { apiErrorResponse } from "@/lib/api-errors";
import { assertSameOrigin } from "@/lib/same-origin";
import { newCorrelationId, logDiagnostic } from "@/lib/server-action-diagnostics";

/**
 * PHASE 7 Route Handler fallback for an authenticated creator resolving a
 * client comment. Same rationale as the sibling reply route — an explicit
 * fetch() resolves in the browser regardless of RSC-merge reliability, so
 * the "Resolving…" control deterministically clears and the caller can
 * flip local state immediately on a 200.
 *
 * `resolveReviewComment(commentId, workspaceId)` does all of the auth/
 * ownership/cross-workspace work in one place: it scopes the comment
 * lookup to workspaces owned by the authenticated creator (never reveals
 * whether a comment exists under a different creator's account), and
 * additionally requires the comment's own workspaceId to match the `[id]`
 * path segment — so this URL can never be used to resolve a comment that
 * belongs to a *different* workspace, even one the same creator owns.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id: workspaceId, commentId } = await params;
  const correlationId = newCorrelationId();
  logDiagnostic(correlationId, "comment-resolve:start", { workspaceId });

  try {
    await resolveReviewComment(commentId, workspaceId);
    logDiagnostic(correlationId, "comment-resolve:success", { workspaceId });
    return NextResponse.json(
      { success: true, message: "Comment resolved." },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logDiagnostic(correlationId, "comment-resolve:error");
    return apiErrorResponse(error, {
      CommentNotFoundError: { status: 404, message: "This comment could not be found." },
      OwnershipError: { status: 404, message: "This workspace could not be found." },
    });
  }
}
