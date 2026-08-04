"use client";

import { useEffect, useRef, useState } from "react";
import { File as FileIcon, FileArchive, AlertTriangle } from "lucide-react";
import { formatBytes } from "@/lib/bytes";
import type { ReviewableFile } from "@/data-access/review-files";

export interface FileThumbnailProps {
  file: ReviewableFile;
  /** Same preview-url base the parent portal uses — token route vs creator-owned route. */
  previewUrlBase: string;
  active: boolean;
  onSelect: () => void;
}

type ThumbState = "idle" | "loading" | "ready" | "error";

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
export function FileThumbnail({ file, previewUrlBase, active, onSelect }: FileThumbnailProps) {
  const [state, setState] = useState<ThumbState>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const isImage = file.fileKind === "IMAGE";

  useEffect(() => {
    if (!isImage) return;
    const node = buttonRef.current;
    if (!node) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void loadThumbnail();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);

    async function loadThumbnail() {
      if (cancelled) return;
      setState("loading");
      try {
        const res = await fetch(`${previewUrlBase}/${file.id}/preview-url?versionId=${file.currentVersionId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.locked || !data.url) {
          setState("error");
          return;
        }
        setUrl(data.url);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [file.id, file.currentVersionId, isImage, previewUrlBase]);

  const Icon = file.fileKind === "ARCHIVE" ? FileArchive : FileIcon;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid="file-thumbnail"
      data-thumb-state={isImage ? state : "n/a"}
      className={`flex shrink-0 items-center gap-2 rounded-md border-2 px-2 py-1.5 text-xs font-bold transition-colors ${
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
                className="h-full w-full object-cover"
              />
            )}
            {(state === "idle" || state === "loading") && (
              <span className="absolute inset-0 animate-pulse bg-[#4B5563]" aria-hidden="true" />
            )}
            {state === "error" && (
              <span className="absolute inset-0 flex items-center justify-center">
                <AlertTriangle size={12} className="text-warning" aria-hidden="true" />
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
