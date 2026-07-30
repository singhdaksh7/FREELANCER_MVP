import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { SystemStateLayout } from "@/components/layout/system-state-layout";

export const metadata: Metadata = {
  title: "Server Error",
};

export default function ServerErrorPage() {
  return (
    <SystemStateLayout
      code="500"
      title="Server Error"
      message="An unexpected error occurred. Please try refreshing or returning later."
      icon={WifiOff}
    />
  );
}
