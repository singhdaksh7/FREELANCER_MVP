import { NextRequest, NextResponse } from "next/server";
import { revokeReviewLink } from "@/data-access/review-links";
import { apiErrorResponse } from "@/lib/api-errors";
import { assertSameOrigin } from "@/lib/same-origin";
import { newCorrelationId, logDiagnostic } from "@/lib/server-action-diagnostics";

/**
 * PHASE 7 Route Handler fallback for secure review-link revocation. Same
 * rationale as review-link creation: the mutation and its revalidatePath
 * both succeeded server-side, but the "Revoking…" dialog never returned to
 * the Create Secure Review Link state because the browser never applied the
 * RSC response. Returns a plain JSON success/failure the client can act on
 * directly.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id: workspaceId } = await params;
  const correlationId = newCorrelationId();
  logDiagnostic(correlationId, "review-link-revoke:start", { workspaceId });

  try {
    await revokeReviewLink(workspaceId);
    logDiagnostic(correlationId, "review-link-revoke:success", { workspaceId });
    return NextResponse.json(
      { success: true, message: "Review link revoked." },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logDiagnostic(correlationId, "review-link-revoke:error");
    return apiErrorResponse(error, {
      ReviewLinkNotFoundError: { status: 404, message: "No active review link exists for this workspace." },
      OwnershipError: { status: 404, message: "This workspace could not be found." },
    });
  }
}
