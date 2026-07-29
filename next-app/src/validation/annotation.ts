import { z } from "zod";

/**
 * Phase 7.5 — lightweight image annotation geometry validation. Every
 * coordinate is normalized [0, 1] against the image's own rendered box
 * (same convention as ReviewComment.pinX/pinY), never a raw pixel value —
 * see IMAGE_ANNOTATION_ARCHITECTURE.md "Normalized coordinates." Geometry
 * is validated numeric-only: no arbitrary CSS/SVG/HTML/script content and
 * no user-controlled XML ever reaches storage or rendering.
 */

const MAX_STROKES = 10;
const MAX_POINTS_PER_STROKE = 200;
/** Rough ceiling on the serialized geometry payload — keeps a single annotation cheap to store/transmit regardless of client-side bugs. */
const MAX_PAYLOAD_BYTES = 20_000;

const coord = z.number().finite().min(0).max(1);
const point = z.tuple([coord, coord]);

const freehandGeometrySchema = z.object({
  strokes: z
    .array(z.array(point).min(2, "A stroke needs at least two points.").max(MAX_POINTS_PER_STROKE))
    .min(1, "At least one stroke is required.")
    .max(MAX_STROKES, `A maximum of ${MAX_STROKES} strokes is allowed per annotation.`),
});

const circleGeometrySchema = z.object({
  cx: coord,
  cy: coord,
  r: z.number().finite().positive().max(1, "Radius must be normalized between 0 and 1."),
});

export const annotationInputSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("FREEHAND"), geometry: freehandGeometrySchema }),
    z.object({ type: z.literal("CIRCLE"), geometry: circleGeometrySchema }),
  ])
  .refine((value) => JSON.stringify(value.geometry).length <= MAX_PAYLOAD_BYTES, {
    message: "Annotation payload is too large.",
  });

export type AnnotationInput = z.infer<typeof annotationInputSchema>;
export type FreehandGeometry = z.infer<typeof freehandGeometrySchema>;
export type CircleGeometry = z.infer<typeof circleGeometrySchema>;
