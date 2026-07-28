import { Filter } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  "aria-label": string;
}

/** Icon-prefixed filter dropdown, matching the original's search-bar filter control. */
export function FilterSelect({ value, onChange, options, ...props }: FilterSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <Filter size={16} color="#64748B" aria-hidden="true" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-white py-2 px-3 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
