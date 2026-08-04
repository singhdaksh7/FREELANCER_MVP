"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { File as FileIcon, FileArchive, RotateCw } from "lucide-react";
import { formatBytes } from "@/lib/bytes";
import { fetchPreviewUrl } from "@/lib/preview-client";
import type { ReviewableFile } from "@/data-access/review-files";

export interface FileThumbnailProps {
  file: ReviewableFile;
  /** Same preview-url base the parent portal uses — token route vs creator-owned route. */
  previewUrlBase: string;
  active: boolean;
  onSelect: () => void;
  onKeyDownNav?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

type ThumbState = "idle" | "loading" | "ready" | "error";

const MAX_AUTO_RETRIES = 1;

/**
 * One tile in the file rail: a small thumbnail (for IMAGE files, cropped
 * from the exact same *protected* preview object the big preview pane
 * shows — never a separately-stored thumbnail asset, never the original)
 * plus the filename, so it stays functionally equivalent to the old
 * emoji+filename chip for anything that identifies a file by its visible
 * text (screen readers, existing tests).
 *
 * Lazy-loads: the presigned preview URL is only fetched once the tile
 * scrolls into view (IntersectionObserver), not eagerly for every file in
 * the rail — a workspace with many files shouldn't fire off that many
 * signed-URL requests up front.
 */
export function FileThumbnail({ file, previewUrlBase, active, onSelect, onKeyDownNav }: FileThumbnailProps) {
  const [state, setState] = useState<ThumbState>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const autoRetriesRef = useRef(0);
  const isImage = file.fileKind === "IMAGE";

  const loadThumbnail = useCallback(async () => {
    setState("loading");
    const result = await fetchPreviewUrl(previewUrlBase, file.id, file.currentVersionId);
    if (result.status !== "ready" || !result.url) {
      setState("error");
      return;
    }
    setUrl(result.url);
    setState("ready");
  }, [file.id, file.currentVersionId, previewUrlBase]);

  useEffect(() => {
    if (!isImage) return;
    const node = buttonRef.current;
    if (!node) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          if (!cancelled) void loadThumbnail();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadThumbnail already depends on the same keys
  }, [file.id, file.currentVersionId, isImage]);

  // A previously-loaded thumbnail's presigned URL is short-lived (60s) — if
  // the browser re-requests it (cache eviction, tab restore) after expiry,
  // retry once with a fresh URL instead of leaving a permanently-broken
  // image icon in the rail.
  function handleImageError() {
    if (autoRetriesRef.current < MAX_AUTO_RETRIES) {
      autoRetriesRef.current += 1;
      void loadThumbnail();
      return;
    }
    setState("error");
  }

  const Icon = file.fileKind === "ARCHIVE" ? FileArchive : FileIcon;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      onKeyDown={onKeyDownNav}
      aria-pressed={active}
      data-testid="file-thumbnail"
      data-thumb-state={isImage ? state : "n/a"}
      className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-md border-2 px-2 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-blue ${
        active ? "border-primary-blue bg-primary-blue/10 text-white" : "border-transparent bg-[#1F2937] text-white hover:bg-[#374151]"
      }`}
      title={file.displayName}
    >
      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-[#374151]">
        {isImage ? (
          <>
            {state === "ready" && url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt=""
                loading="lazy"
                onError={handleImageError}
                className="h-full w-full object-cover"
              />
            )}
            {(state === "idle" || state === "loading") && (
              <span className="absolute inset-0 animate-pulse bg-[#4B5563]" aria-hidden="true" />
            )}
            {state === "error" && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  autoRetriesRef.current = 0;
                  void loadThumbnail();
                }}
                className="absolute inset-0 flex items-center justify-center"
                title="Retry loading preview"
              >
                <RotateCw size={12} className="text-warning" aria-hidden="true" />
              </span>
            )}
          </>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <Icon size={16} className="text-[#9CA3AF]" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col items-start">
        <span className="max-w-[140px] truncate">{file.displayName}</span>
        {!isImage && <span className="text-[9px] font-semibold text-[#9CA3AF]">{formatBytes(file.sizeBytes)}</span>}
      </span>
    </button>
  );
}
