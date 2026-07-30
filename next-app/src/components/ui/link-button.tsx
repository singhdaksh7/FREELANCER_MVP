import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "./button-variants";

export interface LinkButtonProps
  extends LinkProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/** Button-styled next/link, for navigation that should look like a button. */
export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link className={buttonVariants(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
