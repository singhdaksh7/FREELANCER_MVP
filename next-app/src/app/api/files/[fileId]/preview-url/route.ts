import { NextRequest, NextResponse } from "next/server";
import { getOwnedFilePreviewUrl } from "@/data-access/files";
import { apiErrorResponse } from "@/lib/api-errors";

/**
 * Returns a short-lived, server-authorized preview URL — never a
 * long-lived one, and never for an original (see
 * src/data-access/files.ts's getOwnedFilePreviewUrl, which only ever
 * resolves `currentVersion.previewStorageKey`). The creator must own the
 * file's workspace.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;

  try {
    const url = await getOwnedFilePreviewUrl(fileId);
    return NextResponse.json({ url });
  } catch (error) {
    return apiErrorResponse(error, {
      OwnershipError: { status: 404, message: "File not found." },
      PreviewUnavailableError: { status: 409 },
    });
  }
}
