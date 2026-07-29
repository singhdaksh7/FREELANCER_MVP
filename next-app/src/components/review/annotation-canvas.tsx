"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Circle, Pencil, X } from "lucide-react";
import { addAnnotatedCommentAction, type ReviewClientActionState } from "@/actions/review";

export interface AnnotationCanvasProps {
  token: string;
  workspaceFileId: string;
  fileVersionId: string;
  reviewerName: string;
  onClose: () => void;
}

type Tool = "FREEHAND" | "CIRCLE";
type Point = [number, number];

const MAX_STROKES = 10;
const MAX_POINTS_PER_STROKE = 200;

const INITIAL_STATE: ReviewClientActionState = {};

/**
 * Lightweight freehand/circle annotation layer over the protected preview
 * (Phase 7.5) — see IMAGE_ANNOTATION_ARCHITECTURE.md. Draws into an SVG
 * overlay built purely from normalized numeric coordinates (never raw
 * markup), submits the geometry as a JSON string alongside a required
 * text comment, and is validated again server-side (annotationInputSchema)
 * before anything is stored — this component's own bounds-checking is a
 * UX nicety, not the security boundary.
 */
export function AnnotationCanvas({ token, workspaceFileId, fileVersionId, reviewerName, onClose }: AnnotationCanvasProps) {
  const [tool, setTool] = useState<Tool>("FREEHAND");
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [circle, setCircle] = useState<{ cx: number; cy: number; r: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const overlayRef = useRef<SVGSVGElement>(null);
  const [state, action, pending] = useActionState(addAnnotatedCommentAction, INITIAL_STATE);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the action's result changes
  }, [state]);

  function pointFromEvent(event: React.PointerEvent): Point | null {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  }

  function handlePointerDown(event: React.PointerEvent) {
    const point = pointFromEvent(event);
    if (!point) return;
    setDrawing(true);
    if (tool === "FREEHAND") {
      if (strokes.length >= MAX_STROKES) return;
      setStrokes((prev) => [...prev, [point]]);
    } else {
      setCircle({ cx: point[0], cy: point[1], r: 0 });
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!drawing) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (tool === "FREEHAND") {
      setStrokes((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = next[next.length - 1]!;
        if (last.length < MAX_POINTS_PER_STROKE) next[next.length - 1] = [...last, point];
        return next;
      });
    } else if (circle) {
      const dx = point[0] - circle.cx;
      const dy = point[1] - circle.cy;
      setCircle({ ...circle, r: Math.min(1, Math.sqrt(dx * dx + dy * dy)) });
    }
  }

  function handlePointerUp() {
    setDrawing(false);
  }

  function clearDrawing() {
    setStrokes([]);
    setCircle(null);
  }

  const hasDrawing = tool === "FREEHAND" ? strokes.length > 0 : circle !== null && circle.r > 0;
  const geometry =
    tool === "FREEHAND" ? { strokes } : circle ? { cx: circle.cx, cy: circle.cy, r: circle.r } : null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      <svg
        ref={overlayRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="flex-1 touch-none cursor-crosshair"
      >
        {tool === "FREEHAND" &&
          strokes.map((stroke, i) => (
            <polyline
              key={i}
              points={stroke.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke="#ef4444"
              strokeWidth={0.006}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        {tool === "CIRCLE" && circle && circle.r > 0 && (
          <circle cx={circle.cx} cy={circle.cy} r={circle.r} fill="none" stroke="#ef4444" strokeWidth={0.006} />
        )}
      </svg>

      <div className="flex flex-col gap-2 border-t border-white/10 bg-vault-navy-light p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTool("FREEHAND");
              clearDrawing();
            }}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
              tool === "FREEHAND" ? "bg-vault-blue text-white" : "text-slate-300 hover:bg-white/10"
            }`}
          >
            <Pencil size={12} aria-hidden="true" /> Freehand
          </button>
          <button
            type="button"
            onClick={() => {
              setTool("CIRCLE");
              clearDrawing();
            }}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
              tool === "CIRCLE" ? "bg-vault-blue text-white" : "text-slate-300 hover:bg-white/10"
            }`}
          >
            <Circle size={12} aria-hidden="true" /> Circle
          </button>
          <button type="button" onClick={clearDrawing} className="text-xs font-semibold text-slate-400 hover:text-white">
            Clear
          </button>
          <button type="button" onClick={onClose} className="ml-auto text-slate-400 hover:text-white" aria-label="Cancel annotation">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="workspaceFileId" value={workspaceFileId} />
          <input type="hidden" name="fileVersionId" value={fileVersionId} />
          <input type="hidden" name="reviewerName" value={reviewerName || "Reviewer"} />
          <input type="hidden" name="annotationType" value={tool} />
          <input type="hidden" name="geometry" value={geometry ? JSON.stringify(geometry) : ""} />
          <div className="flex gap-2">
            <input
              name="body"
              placeholder="Describe this annotation…"
              maxLength={2000}
              required
              className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending || !hasDrawing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-vault-blue px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Submitting…" : "Submit Annotation"}
            </button>
          </div>
          {state.error && <p className="text-xs text-danger">{state.error}</p>}
        </form>
      </div>
    </div>
  );
}
