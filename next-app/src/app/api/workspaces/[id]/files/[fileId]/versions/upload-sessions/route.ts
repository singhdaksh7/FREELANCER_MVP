import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createFileVersionUploadSession } from "@/data-access/uploads";
import { apiErrorResponse } from "@/lib/api-errors";

const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

/**
 * Step 1 of the version-upload workflow (CLIENT_REVIEW_ARCHITECTURE.md
 * "File-version workflow") — same shape as
 * POST /api/workspaces/[id]/upload-sessions, but scoped to an existing,
 * owned file: creates an UploadSession with `targetFileId` set, so
 * completeUploadSession creates a new FileVersion instead of a new
 * WorkspaceFile. The `[id]` (workspaceId) path segment is accepted for
 * URL-shape consistency with the sibling upload-sessions route but is not
 * itself trusted — ownership is resolved entirely through `fileId`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { fileId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  try {
    const result = await createFileVersionUploadSession(fileId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, {
      OwnershipError: { status: 404, message: "File not found." },
      FileVersionNotAllowedError: { status: 422 },
      UploadValidationError: { status: 422 },
      UploadLimitError: { status: 422 },
    });
  }
}
