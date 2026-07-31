import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedWorkspace, OwnershipError } from "@/data-access/authorization";
import { createPreviewPresignedUrl } from "@/storage/signed-urls";
import { isPreviewableFileKind } from "@/lib/file-kind";
import { bigIntToDisplayNumber } from "@/lib/bytes";

/**
 * Creator-authenticated, workspace-scoped preview access for the
 * "Preview Client View" route (/workspaces/[id]/preview) — the
 * creator-session equivalent of
 * /api/review/[token]/files/[fileId]/preview-url, resolving the exact
 * same submitted-version logic (never an unsubmitted candidate, never an
 * original) so a creator's preview shows exactly what the client would
 * see. Ownership is checked via requireOwnedWorkspace, never trusting the
 * `id`/`fileId` path params alone. A cross-workspace fileId, an
 * unsubmitted version, or a not-owned workspace all resolve through the
 * same generic 404/403 pattern used everywhere else in this app.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id: workspaceId, fileId } = await params;
  const versionId = request.nextUrl.searchParams.get("versionId") ?? undefined;

  try {
    await requireOwnedWorkspace(workspaceId);
  } catch (error) {
    if (error instanceof OwnershipError) {
      return NextResponse.json({ error: "This workspace could not be found." }, { status: 404 });
    }
    console.error("Workspace preview-url authorization failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const file = await prisma.workspaceFile.findFirst({
    where: { id: fileId, workspaceId, deletedAt: null },
  });
  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const version = await prisma.fileVersion.findFirst({
    where: {
      fileId: file.id,
      submittedAt: { not: null },
      ...(versionId ? { id: versionId } : {}),
    },
    orderBy: { versionNumber: "desc" },
  });
  if (!version) {
    return NextResponse.json({ error: "This version is not available for review." }, { status: 404 });
  }

  if (!isPreviewableFileKind(file.fileKind)) {
    return NextResponse.json({
      locked: true,
      fileKind: file.fileKind,
      displayName: file.displayName,
      sizeBytes: bigIntToDisplayNumber(file.sizeBytes),
      message: "Preview not available in this MVP — this is a locked deliverable pending payment.",
    });
  }

  if (version.status !== "READY" || !version.previewStorageKey) {
    return NextResponse.json({ error: "This preview is still processing." }, { status: 409 });
  }

  const url = await createPreviewPresignedUrl(version.previewStorageKey);
  return NextResponse.json({ url, versionId: version.id, versionNumber: version.versionNumber });
}
