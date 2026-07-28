import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** Centered max-width container matching the original page sections (max-width: 1280px / 900px etc. per screen, base 1100px default). */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[1280px] px-6", className)}>
      {children}
    </div>
  );
}
