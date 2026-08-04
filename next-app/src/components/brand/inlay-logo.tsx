import Image from "next/image";
import { cn } from "@/lib/cn";

type InlayLogoProps = {
  size?: "sm" | "md" | "lg";
  priority?: boolean;
  className?: string;
  container?: boolean;
  "data-testid"?: string;
};

const DIMENSIONS = {
  sm: { width: 76, height: 36 },
  md: { width: 100, height: 48 },
  lg: { width: 135, height: 65 },
};

export function InlayLogo({ size = "md", priority = false, className, container = false, "data-testid": testId }: InlayLogoProps) {
  const { width, height } = DIMENSIONS[size];

  const image = (
    <Image
      src="/brand/inlay-logo.webp"
      alt="INLAY"
      width={width}
      height={height}
      priority={priority}
      className={cn("object-contain", !container && className)}
      data-testid={testId}
    />
  );

  if (container) {
    return (
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-[10px] bg-white px-2.5 py-2",
          className
        )}
      >
        {image}
      </div>
    );
  }

  return image;
}
