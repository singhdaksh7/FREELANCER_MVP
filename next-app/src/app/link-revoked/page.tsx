import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { SystemStateLayout } from "@/components/layout/system-state-layout";

export const metadata: Metadata = {
  title: "Link Revoked",
};

export default function LinkRevokedPage() {
  return (
    <SystemStateLayout
      code="REVOKED"
      title="Link Revoked by Creator"
      message="This workspace link has been archived or disabled by Arjun Raj."
      icon={Lock}
    />
  );
}
