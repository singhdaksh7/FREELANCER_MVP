import { describe, expect, it } from "vitest";
import { annotationInputSchema } from "./annotation";

describe("annotationInputSchema — FREEHAND", () => {
  it("accepts a valid single-stroke freehand annotation", () => {
    const result = annotationInputSchema.safeParse({
      type: "FREEHAND",
      geometry: { strokes: [[[0, 0], [0.5, 0.5], [1, 1]]] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stroke with fewer than two points", () => {
    const result = annotationInputSchema.safeParse({
      type: "FREEHAND",
      geometry: { strokes: [[[0.5, 0.5]]] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a coordinate outside 0..1", () => {
    const result = annotationInputSchema.safeParse({
      type: "FREEHAND",
      geometry: { strokes: [[[0, 0], [1.5, 0.5]]] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than the maximum number of strokes", () => {
    const strokes = Array.from({ length: 11 }, () => [
      [0, 0],
      [0.1, 0.1],
    ]);
    const result = annotationInputSchema.safeParse({ type: "FREEHAND", geometry: { strokes } });
    expect(result.success).toBe(false);
  });

  it("rejects more than the maximum points in a single stroke", () => {
    const stroke = Array.from({ length: 201 }, (_, i) => [i / 201, i / 201]);
    const result = annotationInputSchema.safeParse({ type: "FREEHAND", geometry: { strokes: [stroke] } });
    expect(result.success).toBe(false);
  });

  it("rejects zero strokes", () => {
    const result = annotationInputSchema.safeParse({ type: "FREEHAND", geometry: { strokes: [] } });
    expect(result.success).toBe(false);
  });
});

describe("annotationInputSchema — CIRCLE", () => {
  it("accepts a valid circle", () => {
    const result = annotationInputSchema.safeParse({ type: "CIRCLE", geometry: { cx: 0.5, cy: 0.5, r: 0.1 } });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive radius", () => {
    const result = annotationInputSchema.safeParse({ type: "CIRCLE", geometry: { cx: 0.5, cy: 0.5, r: 0 } });
    expect(result.success).toBe(false);
  });

  it("rejects a center outside 0..1", () => {
    const result = annotationInputSchema.safeParse({ type: "CIRCLE", geometry: { cx: -0.1, cy: 0.5, r: 0.1 } });
    expect(result.success).toBe(false);
  });
});

describe("annotationInputSchema — safety", () => {
  it("rejects an unrecognized type", () => {
    const result = annotationInputSchema.safeParse({ type: "RECTANGLE", geometry: {} });
    expect(result.success).toBe(false);
  });

  it("rejects a payload that is too large", () => {
    const hugeStroke = Array.from({ length: 200 }, (_, i) => [i / 200, i / 200]);
    const strokes = Array.from({ length: 10 }, () => hugeStroke);
    const result = annotationInputSchema.safeParse({ type: "FREEHAND", geometry: { strokes } });
    expect(result.success).toBe(false);
  });

  it("never accepts raw markup/script content in place of numeric geometry", () => {
    const result = annotationInputSchema.safeParse({
      type: "FREEHAND",
      geometry: { strokes: "<script>alert(1)</script>" },
    });
    expect(result.success).toBe(false);
  });
});
