import { NextRequest, NextResponse } from "next/server";
import { completeUploadSession } from "@/data-access/uploads";
import { apiErrorResponse } from "@/lib/api-errors";

/**
 * Steps 7-11 of the secure upload workflow: called by the browser after
 * its direct PUT to the presigned URL finishes. Never trusts that the
 * browser's own "upload complete" signal means anything by itself — see
 * completeUploadSession()'s server-side object verification.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  try {
    const result = await completeUploadSession(sessionId);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, {
      UploadSessionInvalidError: { status: 410 },
      UploadVerificationError: { status: 422 },
      UploadLimitError: { status: 422 },
    });
  }
}
