import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedWorkspace, OwnershipError } from "@/data-access/authorization";
import { createPreviewPresignedUrl } from "@/storage/signed-urls";
import { isPreviewableFileKind } from "@/lib/file-kind";
import { bigIntToDisplayNumber } from "@/lib/bytes";

/**
 * Creator-authenticated, workspace-scoped preview access for the
 * "Preview Client View" route (/workspaces/[id]/preview). Deliberately
 * NOT the same authorization rule as
 * /api/review/[token]/files/[fileId]/preview-url: the public route
 * requires `submittedAt != null` (a client must never see an unsubmitted
 * file), but the creator's own preview must show the current READY
 * version immediately — even before it's ever been submitted — so the
 * creator can confirm a fresh upload looks right before sharing a link.
 *
 * Only ever resolves `file.currentVersionId` — never an arbitrary
 * `versionId` and never `pendingVersionId` (an in-flight/failed
 * re-upload candidate): if a `versionId` query param is supplied and
 * doesn't match the current version, this 404s exactly like a
 * cross-workspace file would, rather than exposing any other version's
 * preview. Ownership is checked via requireOwnedWorkspace, never trusting
 * the `id`/`fileId` path params alone.
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
  if (!file || !file.currentVersionId) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  if (versionId && versionId !== file.currentVersionId) {
    return NextResponse.json({ error: "This version is not available for preview." }, { status: 404 });
  }

  const version = await prisma.fileVersion.findFirst({
    where: { id: file.currentVersionId, fileId: file.id },
  });
  if (!version) {
    return NextResponse.json({ error: "This version is not available for preview." }, { status: 404 });
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
