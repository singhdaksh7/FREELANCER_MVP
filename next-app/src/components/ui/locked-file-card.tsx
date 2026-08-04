import { Lock } from "lucide-react";

export interface LockedFileCardProps {
  message: string;
  className?: string;
}

/** Visually distinct "this file type has no protected preview" card — shared by the creator file card and the client review canvas so unsupported-type files never render as a bare text line. */
export function LockedFileCard({ message, className = "" }: LockedFileCardProps) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line bg-slate-50 px-4 py-6 text-center dark:border-[#374151] dark:bg-[#1F2937] ${className}`}
    >
      <Lock size={22} className="text-ink-muted dark:text-[#9CA3AF]" aria-hidden="true" />
      <p className="text-xs font-medium text-ink-muted dark:text-[#9CA3AF]">{message}</p>
    </div>
  );
}
