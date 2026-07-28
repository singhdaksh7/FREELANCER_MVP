import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { SystemStateLayout } from "@/components/layout/system-state-layout";

export const metadata: Metadata = {
  title: "Permission Denied",
};

export default function PermissionDeniedPage() {
  return (
    <SystemStateLayout
      code="403"
      title="Permission Denied"
      message="You do not have access rights to view this private workspace token."
      icon={ShieldAlert}
    />
  );
}
