"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

export interface UploadDropzoneProps {
  onFilesSelected: (files: FileList) => void;
  acceptHint: string;
}

/** Drag-and-drop upload area + Browse Files button, per the approved Files-tab design. */
export function UploadDropzone({ onFilesSelected, acceptHint }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragActive(false);
        if (event.dataTransfer.files.length > 0) onFilesSelected(event.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        isDragActive ? "border-vault-blue bg-vault-blue-light" : "border-line bg-slate-50"
      }`}
    >
      <UploadCloud size={28} className="text-ink-muted" aria-hidden="true" />
      <p className="text-sm font-semibold text-ink">Drag and drop files here</p>
      <p className="text-xs text-ink-muted">{acceptHint}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      >
        Browse Files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        aria-label="Choose files to upload"
        className="sr-only"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            onFilesSelected(event.target.files);
            event.target.value = "";
          }
        }}
      />
    </div>
  );
}
