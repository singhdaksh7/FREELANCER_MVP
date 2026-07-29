import "server-only";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { addClientReviewComment } from "./review-comments";
import { annotationInputSchema, type AnnotationInput } from "@/validation/annotation";
import type { ReviewContext } from "./review-auth";

export class AnnotationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnotationValidationError";
  }
}

export interface CreateAnnotatedCommentInput {
  body: string;
  workspaceFileId: string;
  fileVersionId: string;
  /** Raw, untrusted annotation payload — validated here against annotationInputSchema before anything is stored. */
  annotation: unknown;
  reviewerName?: string;
  reviewerEmail?: string;
}

/**
 * Client places a freehand or circle annotation on the current image
 * version and submits it with a related comment — see
 * IMAGE_ANNOTATION_ARCHITECTURE.md. The comment (created through the same
 * secure path as any other client comment, so file/version ownership is
 * verified there) and the annotation are written together; a comment is
 * never left without its annotation or vice versa.
 */
export async function addClientAnnotatedComment(
  context: ReviewContext,
  input: CreateAnnotatedCommentInput,
): Promise<{ commentId: string; annotationId: string }> {
  const parsed = annotationInputSchema.safeParse(input.annotation);
  if (!parsed.success) {
    throw new AnnotationValidationError(parsed.error.issues[0]?.message ?? "Invalid annotation.");
  }
  const validated: AnnotationInput = parsed.data;

  const { id: commentId } = await addClientReviewComment(context, {
    body: input.body,
    workspaceFileId: input.workspaceFileId,
    fileVersionId: input.fileVersionId,
    reviewerName: input.reviewerName,
    reviewerEmail: input.reviewerEmail,
  });

  const annotation = await prisma.$transaction(async (tx) => {
    const created = await tx.reviewAnnotation.create({
      data: {
        commentId,
        workspaceId: context.workspaceId,
        workspaceFileId: input.workspaceFileId,
        fileVersionId: input.fileVersionId,
        type: validated.type,
        geometry: validated.geometry,
      },
      select: { id: true },
    });
    await recordActivity(tx, {
      action: ActivityAction.IMAGE_ANNOTATION_ADDED,
      actorType: "CLIENT",
      actorName: (input.reviewerName ?? "").trim() || "Reviewer",
      workspaceId: context.workspaceId,
      metadata: { annotationType: validated.type },
    });
    return created;
  });

  return { commentId, annotationId: annotation.id };
}

export interface ReviewAnnotationItem {
  id: string;
  commentId: string;
  type: string;
  geometry: unknown;
}

/** Every annotation for a workspace, keyed for client-side lookup by commentId. Geometry is exactly what was validated at write time — safe to render directly via canvas/SVG numeric primitives, never as raw markup. */
export async function getReviewAnnotations(workspaceId: string): Promise<ReviewAnnotationItem[]> {
  const rows = await prisma.reviewAnnotation.findMany({
    where: { workspaceId },
    select: { id: true, commentId: true, type: true, geometry: true },
  });
  return rows;
}
