import "server-only";
import { prisma } from "@/lib/prisma";
import { requireOwnedWorkspace } from "./authorization";
import { bigIntToDisplayNumber } from "@/lib/bytes";
import type { ReviewableFile } from "./review-files";

/**
 * Files/versions the creator-authenticated "Preview Client View"
 * (`/workspaces/[id]/preview`) is allowed to show — the current READY
 * version of every non-deleted owned file, regardless of whether it has
 * ever been submitted to a client (`submittedAt`). This is deliberately
 * broader than `getReviewableFiles` (the public `/review/[token]` data
 * source, which strictly requires `submittedAt != null`): the creator's own
 * preview is meant to show "what does this file look like right now,"
 * including a freshly-processed file that hasn't been shared yet, and it
 * never needs the "has this been submitted to a client" gate because the
 * creator IS the one who would do the submitting.
 *
 * - Ownership is enforced here (via `requireOwnedWorkspace`) — callers
 *   never need to separately authorize.
 * - Only the file's `currentVersionId` is considered, never
 *   `pendingVersionId` (an in-flight/failed re-upload candidate) — a
 *   pending version is never shown here, submitted or not.
 * - Only versions with `status === "READY"` are returned — a still-
 *   `PROCESSING` or `FAILED` current version means the file simply doesn't
 *   appear yet (mirrors how `getReviewableFiles` omits files with no
 *   submitted versions).
 * - Read-only: this function never writes `submittedAt` or any other field.
 * - Never exposes `originalStorageKey` — the same field allowlist as
 *   `getReviewableFiles`.
 */
export async function getCreatorPreviewFiles(workspaceId: string): Promise<ReviewableFile[]> {
  await requireOwnedWorkspace(workspaceId);

  const files = await prisma.workspaceFile.findMany({
    where: { workspaceId, deletedAt: null, currentVersionId: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { currentVersion: true },
  });

  return files
    .filter((file) => file.currentVersion !== null && file.currentVersion.status === "READY")
    .map((file) => {
      const version = file.currentVersion!;
      return {
        id: file.id,
        displayName: file.displayName,
        fileKind: file.fileKind,
        mimeType: file.mimeType,
        sizeBytes: bigIntToDisplayNumber(file.sizeBytes),
        currentVersionId: version.id,
        versions: [
          {
            id: version.id,
            versionNumber: version.versionNumber,
            // Never a real "submitted to client" timestamp — this file may
            // never have been submitted at all. `createdAt` is a read-model
            // display value only, never written back to the DB, and never
            // confused with the public portal's submittedAt-gated data.
            submittedAt: version.submittedAt?.toISOString() ?? version.createdAt.toISOString(),
            previewReady: version.status === "READY" && Boolean(version.previewStorageKey),
          },
        ],
      };
    });
}
