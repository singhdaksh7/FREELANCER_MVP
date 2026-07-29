# Image Annotation Architecture (Phase 7.5)

Two related but distinct features on the protected image preview: numbered
pin comments (existing `ReviewComment.pinX`/`pinY`/`pinNumber`, this
phase's addition is the capture UI + numbering logic) and freehand/circle
doodle annotations (`ReviewAnnotation`, new model + full stack).

## Normalized coordinates

Both features store coordinates normalized to `[0, 1]` against the
rendered image's own bounding box (`getBoundingClientRect()` in
`pin-overlay.tsx`/`annotation-canvas.tsx`), never raw pixels — so a pin or
stroke placed on a 400px-wide preview stays in the same visual position
when the same image later renders at 1200px (mobile vs. desktop, window
resize). This is the same convention `ReviewComment.pinX`/`pinY` already
used before this phase.

## Numbered pin comments

- Client clicks/taps "Add Pin", then clicks the image; `PinOverlay`
  computes normalized `(x, y)` from the click point and the overlay's own
  `getBoundingClientRect()`, and hands it to the comment form as a
  "pending pin" — the comment body input is still a completely normal text
  field (a keyboard user can submit a comment with no pin at all).
- **Pin numbering** (`ReviewComment.pinNumber`) is assigned server-side,
  inside the same transaction as the comment insert, in
  `createComment` (`src/data-access/review-comments.ts`):
  `MAX(pinNumber) + 1` scoped to `fileVersionId` — deterministic, stable,
  and never recomputed later. A new file version starts pin numbering over
  at 1; pins are never carried forward across versions (a pin's
  `fileVersionId` is fixed at creation).
- Selecting a pin marker highlights its comment (and vice versa) via
  `highlightedCommentId` state shared between `PinOverlay` and
  `ReviewCommentsPanel`.
- A reply is never itself a new pin (`createComment` sets
  `pinX`/`pinY`/`pinNumber` from the parent, ignoring any pin fields a
  reply submission might carry).
- Mobile: the overlay's `onClick` fires from a synthesized click after a
  tap on all modern mobile browsers, so no separate touch-event handling
  was needed.

## Freehand / circle annotations

`ReviewAnnotation` — `type: FREEHAND | CIRCLE`, `geometry: Json`, always
tied to a `ReviewComment` (an annotation is never created without its
related text comment; `addClientAnnotatedComment`,
`src/data-access/annotations.ts`, creates both in the same call).

### Validation (`src/validation/annotation.ts`)

- `FREEHAND`: `{ strokes: [[x, y], ...][] }` — 1–10 strokes
  (`MAX_STROKES`), each with 2–200 points (`MAX_POINTS_PER_STROKE`), every
  coordinate a finite number in `[0, 1]`.
- `CIRCLE`: `{ cx, cy, r }` — center in `[0, 1]`, radius `> 0` and `≤ 1`.
- A `refine` rejects a serialized geometry payload over ~20KB
  (`MAX_PAYLOAD_BYTES`) regardless of shape.
- Zod's `discriminatedUnion` on `type` means an unrecognized type or a
  non-numeric/non-array geometry (e.g. a string, an object with the wrong
  shape) fails validation outright — there is no code path that accepts
  arbitrary CSS, SVG, HTML, or script content, or renders user-controlled
  XML.
- Validated **server-side** in `addClientAnnotatedComment` before anything
  is written — the client-side drawing bounds-checking in
  `annotation-canvas.tsx` is a UX nicety, not the security boundary.

### Rendering safety

Both the capture UI (`annotation-canvas.tsx`) and any future read-side
renderer build an `<svg>`/`<polyline>`/`<circle>` purely from the
validated numeric fields (`strokes[i][j]`, `cx`, `cy`, `r`) — there is no
`dangerouslySetInnerHTML`, no raw-string SVG/HTML construction, and no
path where a stored `geometry` value is interpreted as anything other
than numbers going into JSX attribute props (`points`, `cx`, `cy`, `r`,
etc., which React itself escapes/type-checks).

### Client flow

1. "Annotate" toggle (next to "Add Pin", mutually exclusive with it) opens
   `AnnotationCanvas`, an absolutely-positioned `<svg>` overlay.
2. Freehand: pointer-down starts a new stroke (capped at
   `MAX_STROKES`/`MAX_POINTS_PER_STROKE` client-side too, matching the
   server limits so a user gets an immediate visual cap rather than a
   late rejection); pointer-move appends points; pointer-up ends the
   stroke.
3. Circle: pointer-down sets the center; pointer-move computes the radius
   from the drag distance; pointer-up finalizes.
4. "Clear" discards the current unsaved drawing. A required text comment
   plus the drawn geometry (serialized to a hidden JSON form field) submit
   together via `addAnnotatedCommentAction`
   (`src/actions/review.ts`).

## Video timestamp annotations

Explicitly deferred — no video upload/playback exists in this MVP at all
(see the phase's deferred-features list).

## Test coverage

- Unit: `src/validation/annotation.test.ts` — valid/invalid geometry for
  both types, stroke/point/payload-size limits, rejection of
  non-numeric/malformed input.
- Integration: `src/data-access/review-workflow.integration.test.ts` —
  pin-numbering determinism across versions
  ("assigns deterministic, per-version pin numbers"), reply-inherits-
  parent-version for a pinned comment; `addClientAnnotatedComment` creates
  a comment + annotation together and stores geometry exactly as
  validated, and rejects out-of-range geometry before writing anything
  (no orphaned comment on validation failure).
