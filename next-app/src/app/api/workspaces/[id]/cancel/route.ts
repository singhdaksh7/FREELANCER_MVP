import { NextRequest, NextResponse } from "next/server";
import { cancelOwnedWorkspace } from "@/data-access/workspaces";
import { apiErrorResponse } from "@/lib/api-errors";
import { assertSameOrigin } from "@/lib/same-origin";
import { newCorrelationId, logDiagnostic } from "@/lib/server-action-diagnostics";

/**
 * PHASE 7 Route Handler fallback for workspace cancellation — same
 * rationale as the file-delete and review-link routes.
 * `cancelOwnedWorkspace` is itself idempotent-safe: a second call against
 * an already-CANCELLED workspace hits `assertWorkspaceTransition` and
 * returns a 409, it never re-cancels or double-logs activity.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id: workspaceId } = await params;
  const correlationId = newCorrelationId();
  logDiagnostic(correlationId, "workspace-cancel:start", { workspaceId });

  try {
    await cancelOwnedWorkspace(workspaceId);
    logDiagnostic(correlationId, "workspace-cancel:success", { workspaceId });
    return NextResponse.json({ success: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logDiagnostic(correlationId, "workspace-cancel:error");
    return apiErrorResponse(error, {
      InvalidStatusTransitionError: { status: 409 },
      OwnershipError: { status: 404, message: "This workspace could not be found." },
    });
  }
}
