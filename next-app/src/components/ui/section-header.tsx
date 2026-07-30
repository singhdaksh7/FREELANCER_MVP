import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Page-level heading + optional description + optional trailing action, shared across creator list screens. */
export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
