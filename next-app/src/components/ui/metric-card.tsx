import type { LucideIcon } from "lucide-react";

export interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  iconColor?: string;
  helperText?: string;
}

/** Dashboard-style metric card: label + icon row, large value, optional helper line. */
export function MetricCard({
  label,
  value,
  icon: Icon,
  iconColor = "var(--color-vault-blue)",
  helperText,
}: MetricCardProps) {
  return (
    <div className="rounded-md border border-line bg-surface-card p-5">
      <div className="flex items-center justify-between text-[13px] font-medium text-ink-muted">
        <span>{label}</span>
        <Icon size={18} color={iconColor} aria-hidden="true" />
      </div>
      <div className="mt-2 text-[28px] font-extrabold text-ink">{value}</div>
      {helperText && <div className="mt-1 text-xs text-ink-muted">{helperText}</div>}
    </div>
  );
}
