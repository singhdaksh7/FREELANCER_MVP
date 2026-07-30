import type { Metadata } from "next";
import { AlertOctagon } from "lucide-react";
import { SystemStateLayout } from "@/components/layout/system-state-layout";

export const metadata: Metadata = {
  title: "Page Not Found",
};

export default function NotFound() {
  return (
    <SystemStateLayout
      code="404"
      title="Page Not Found"
      message="The page you're looking for doesn't exist or hasn't been migrated to the new app yet."
      icon={AlertOctagon}
    />
  );
}
