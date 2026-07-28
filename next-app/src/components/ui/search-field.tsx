import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
}

/** Icon-prefixed search input. Accessible name comes from the required `aria-label` (matches the original's icon-only, no-visible-label search bars). */
export function SearchField({ value, onChange, ...props }: SearchFieldProps) {
  return (
    <div className="relative min-w-60 flex-1">
      <Search
        size={16}
        color="#94A3B8"
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-line py-2 pl-9 pr-3 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        {...props}
      />
    </div>
  );
}
