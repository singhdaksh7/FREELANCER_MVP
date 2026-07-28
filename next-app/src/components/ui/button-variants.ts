import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-vault-blue text-white hover:bg-vault-blue-hover",
  secondary: "bg-slate-100 text-ink hover:bg-slate-200",
  outline:
    "border border-vault-blue text-vault-blue bg-transparent hover:bg-vault-blue-light",
  ghost: "bg-transparent text-ink-muted hover:text-ink",
};

const sizes: Record<ButtonSize, string> = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-8 py-4 text-base",
};

export function buttonVariants(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className);
}
