"use client";

import { useRef } from "react";
import type { ReviewCommentThreadItem } from "@/data-access/review-comments";

export interface PinOverlayProps {
  /** Only pin comments for the currently-active file/version — never carried over from another version. */
  pins: ReviewCommentThreadItem[];
  addPinMode: boolean;
  pendingPin: { x: number; y: number } | null;
  highlightedCommentId: string | null;
  onPlacePin: (x: number, y: number) => void;
  onSelectPin: (commentId: string) => void;
}

/**
 * Absolutely-positioned numbered-pin layer over the protected preview
 * image. Coordinates are normalized (0..1) against the image's own
 * rendered box, so they stay accurate across resizes/devices — never
 * against the page or a fixed pixel size. See
 * IMAGE_ANNOTATION_ARCHITECTURE.md "Normalized coordinates."
 */
export function PinOverlay({ pins, addPinMode, pendingPin, highlightedCommentId, onPlacePin, onSelectPin }: PinOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!addPinMode || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onPlacePin(x, y);
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleClick}
      className={`absolute inset-0 ${addPinMode ? "cursor-crosshair" : ""}`}
      role="presentation"
    >
      {pins.map(
        (pin) =>
          pin.pinX !== null &&
          pin.pinY !== null &&
          pin.pinNumber !== null && (
            <button
              key={pin.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPin(pin.id);
              }}
              aria-label={`Pin ${pin.pinNumber}: ${pin.body.slice(0, 60)}`}
              style={{ left: `${pin.pinX * 100}%`, top: `${pin.pinY * 100}%` }}
              className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md transition-transform hover:scale-110 ${
                highlightedCommentId === pin.id ? "bg-danger ring-2 ring-white" : "bg-vault-blue"
              }`}
            >
              {pin.pinNumber}
            </button>
          ),
      )}

      {pendingPin && (
        <span
          style={{ left: `${pendingPin.x * 100}%`, top: `${pendingPin.y * 100}%` }}
          className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed border-white bg-warning/80 text-[11px] font-bold text-white"
          aria-hidden="true"
        >
          +
        </span>
      )}
    </div>
  );
}
