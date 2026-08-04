import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authorizeReviewToken,
  InvalidReviewTokenError,
  ReviewLinkExpiredError,
  ReviewLinkRevokedError,
  WorkspaceUnavailableError,
} from "@/data-access/review-auth";
import { createPreviewPresignedUrl } from "@/storage/signed-urls";
import { isPreviewableFileKind } from "@/lib/file-kind";
import { unpreviewableFileLockedMessage } from "@/lib/preview-lock-copy";
import { bigIntToDisplayNumber } from "@/lib/bytes";

/**
 * Token-authorized, workspace-scoped preview access for the client review
 * portal — never resolves an original storage key, never returns a URL
 * for a version that hasn't been explicitly submitted for review (see
 * FileVersion.submittedAt). See CLIENT_REVIEW_ARCHITECTURE.md
 * "Token-authorized preview access."
 *
 * A cross-workspace fileId, an unsubmitted version, or a not-yet-ready
 * version all resolve through the exact same generic 404, so a caller can
 * never distinguish "wrong workspace" from "not ready yet" from "doesn't
 * exist" — the same ownership-collapsing pattern every other data-access
 * boundary in this app already uses.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; fileId: string }> },
) {
  const { token, fileId } = await params;
  const versionId = request.nextUrl.searchParams.get("versionId") ?? undefined;

  let context;
  try {
    context = await authorizeReviewToken(token);
  } catch (error) {
    if (
      error instanceof InvalidReviewTokenError ||
      error instanceof ReviewLinkExpiredError ||
      error instanceof ReviewLinkRevokedError ||
      error instanceof WorkspaceUnavailableError
    ) {
      return NextResponse.json({ error: "This review link is not valid." }, { status: 401 });
    }
    console.error("Review preview-url authorization failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const file = await prisma.workspaceFile.findFirst({
    where: { id: fileId, workspaceId: context.workspaceId, deletedAt: null },
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
      message: unpreviewableFileLockedMessage(context.workspace.deliveryMode),
    });
  }

  if (version.status !== "READY" || !version.previewStorageKey) {
    return NextResponse.json({ error: "This preview is still processing." }, { status: 409 });
  }

  const url = await createPreviewPresignedUrl(version.previewStorageKey);
  return NextResponse.json({ url, versionId: version.id, versionNumber: version.versionNumber });
}
