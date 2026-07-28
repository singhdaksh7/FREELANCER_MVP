import type { LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Shared empty/no-results placeholder for list screens. */
export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-surface-card px-6 py-16 text-center"
    >
      <Icon size={32} color="#94A3B8" aria-hidden="true" />
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
    </div>
  );
}
