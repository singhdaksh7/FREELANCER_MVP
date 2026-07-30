import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUploadSession } from "@/data-access/uploads";
import { apiErrorResponse } from "@/lib/api-errors";

const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

/**
 * Step 1 of the secure upload workflow (FILE_STORAGE_ARCHITECTURE.md):
 * creates an UploadSession + presigned PUT URL for one declared file.
 * Route handler (not a Server Action) per the Phase 5 brief — this is a
 * pure request/response HTTP workflow the upload widget calls via fetch.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;

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
    const result = await createUploadSession(workspaceId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, {
      OwnershipError: { status: 404, message: "Workspace not found." },
      UploadValidationError: { status: 422 },
      UploadLimitError: { status: 422 },
    });
  }
}
