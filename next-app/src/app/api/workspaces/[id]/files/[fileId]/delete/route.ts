import { NextRequest, NextResponse } from "next/server";
import { deleteOwnedFile } from "@/data-access/files";
import { apiErrorResponse } from "@/lib/api-errors";
import { assertSameOrigin } from "@/lib/same-origin";
import { newCorrelationId, logDiagnostic } from "@/lib/server-action-diagnostics";

/**
 * PHASE 7 Route Handler fallback for file deletion (see
 * SERVER_ACTION_REPRO_VERSION_MATRIX.md / Phase 7 final report). The
 * `useActionState`-driven Server Action version left the UI able to
 * complete a real, correct mutation server-side while the browser never
 * applied the returned RSC tree, so the file card stayed on screen
 * indefinitely. Client callers get a plain JSON success/failure they can
 * act on directly instead of depending solely on an RSC merge.
 *
 * The `[id]` (workspaceId) path segment is accepted for URL-shape
 * consistency but isn't itself trusted for authorization — ownership is
 * resolved entirely through `fileId` (see requireOwnedWorkspaceFile).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { fileId } = await params;
  const correlationId = newCorrelationId();
  logDiagnostic(correlationId, "file-delete:start", { fileId });

  try {
    await deleteOwnedFile(fileId);
    logDiagnostic(correlationId, "file-delete:success", { fileId });
    return NextResponse.json({ success: true, fileId }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logDiagnostic(correlationId, "file-delete:error");
    return apiErrorResponse(error, {
      FileNotDeletableError: { status: 422 },
      OwnershipError: { status: 404, message: "This file could not be found." },
    });
  }
}
