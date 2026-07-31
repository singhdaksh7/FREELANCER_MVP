import "server-only";
import { prisma } from "@/lib/prisma";
import { bigIntToDisplayNumber } from "@/lib/bytes";

export class ReviewFileNotFoundError extends Error {
  constructor(message = "This file could not be found.") {
    super(message);
    this.name = "ReviewFileNotFoundError";
  }
}

export interface ReviewableFileVersion {
  id: string;
  versionNumber: number;
  submittedAt: string;
  previewReady: boolean;
}

export interface ReviewableFile {
  id: string;
  displayName: string;
  fileKind: string;
  mimeType: string;
  sizeBytes: number;
  currentVersionId: string;
  versions: ReviewableFileVersion[];
}

/**
 * Files/versions the client review portal is allowed to show — strictly
 * versions with `submittedAt != null` (never a raw `currentVersionId`,
 * which might be an unsubmitted candidate mid-review). A file with zero
 * submitted versions never appears here at all. Never exposes original
 * storage keys — only enough metadata to drive the file/version switcher.
 */
export async function getReviewableFiles(context: { workspaceId: string }): Promise<ReviewableFile[]> {
  const files = await prisma.workspaceFile.findMany({
    where: { workspaceId: context.workspaceId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { versions: { where: { submittedAt: { not: null } }, orderBy: { versionNumber: "asc" } } },
  });

  return files
    .filter((file) => file.versions.length > 0)
    .map((file) => {
      const current = file.versions[file.versions.length - 1];
      return {
        id: file.id,
        displayName: file.displayName,
        fileKind: file.fileKind,
        mimeType: file.mimeType,
        sizeBytes: bigIntToDisplayNumber(file.sizeBytes),
        currentVersionId: current.id,
        versions: file.versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          submittedAt: v.submittedAt!.toISOString(),
          previewReady: v.status === "READY" && Boolean(v.previewStorageKey),
        })),
      };
    });
}
