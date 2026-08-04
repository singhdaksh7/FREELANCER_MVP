import { NextRequest, NextResponse } from "next/server";
import { addCreatorReviewComment } from "@/data-access/review-comments";
import { apiErrorResponse } from "@/lib/api-errors";
import { assertSameOrigin } from "@/lib/same-origin";
import { newCorrelationId, logDiagnostic } from "@/lib/server-action-diagnostics";

/**
 * PHASE 7 Route Handler fallback for an authenticated creator's reply to a
 * client comment (see the review-link create/revoke/regenerate routes for
 * the same rationale). The `useActionState`-driven Server Action version
 * left the reply correctly committed to the database while the browser
 * never reliably applied the RSC response, so the reply never appeared —
 * and separately, `.first()`-style E2E targeting made it easy to miss that
 * a reply had landed under the wrong (unrelated) comment. This route
 * returns the persisted reply directly in JSON so the caller can insert it
 * into the correct thread deterministically, with no dependency on an RSC
 * merge or a page reload.
 *
 * Ownership and cross-workspace validation are entirely delegated to
 * `addCreatorReviewComment` → `requireOwnedWorkspace` (workspace) and the
 * parent-lookup inside `createComment`, which is scoped to `workspaceId`
 * (rejects a `parentId` belonging to a different workspace).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id: workspaceId } = await params;
  const correlationId = newCorrelationId();
  logDiagnostic(correlationId, "comment-reply:start", { workspaceId });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parentId = isRecord(payload) && typeof payload.parentId === "string" ? payload.parentId : "";
  const body = isRecord(payload) && typeof payload.body === "string" ? payload.body : "";

  if (!parentId) {
    return NextResponse.json({ error: "A parent comment is required." }, { status: 400 });
  }

  try {
    const reply = await addCreatorReviewComment(workspaceId, { body, parentId });
    logDiagnostic(correlationId, "comment-reply:success", { workspaceId });
    return NextResponse.json({ success: true, reply }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logDiagnostic(correlationId, "comment-reply:error");
    return apiErrorResponse(error, {
      CommentValidationError: { status: 422 },
      OwnershipError: { status: 404, message: "This workspace could not be found." },
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
