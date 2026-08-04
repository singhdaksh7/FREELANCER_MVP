import { NextRequest, NextResponse } from "next/server";
import { createReviewLink } from "@/data-access/review-links";
import { apiErrorResponse } from "@/lib/api-errors";
import { assertSameOrigin } from "@/lib/same-origin";
import { newCorrelationId, logDiagnostic } from "@/lib/server-action-diagnostics";

/**
 * PHASE 7 Route Handler fallback for secure review-link creation. Same
 * rationale as the file-delete route: the mutation and its revalidatePath
 * both succeeded server-side, but the "Creating…" button never cleared
 * because the browser never applied the RSC response. Returns the
 * one-time raw link directly in JSON — never cached, never logged.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id: workspaceId } = await params;
  const correlationId = newCorrelationId();
  logDiagnostic(correlationId, "review-link-create:start", { workspaceId });

  try {
    const { rawToken, expiresAt } = await createReviewLink(workspaceId);
    logDiagnostic(correlationId, "review-link-create:success", { workspaceId });
    return NextResponse.json(
      { success: true, rawLink: `/review/${rawToken}`, expiresAt },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logDiagnostic(correlationId, "review-link-create:error");
    return apiErrorResponse(error, {
      ReviewLinkNotEligibleError: { status: 422 },
      OwnershipError: { status: 404, message: "This workspace could not be found." },
    });
  }
}
