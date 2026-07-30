import type { Metadata } from "next";
import { AlertOctagon } from "lucide-react";
import { SystemStateLayout } from "@/components/layout/system-state-layout";

export const metadata: Metadata = {
  title: "Secure Link Expired",
};

export default function LinkExpiredPage() {
  return (
    <SystemStateLayout
      code="EXPIRED"
      title="Secure Link Expired"
      message="This payment-gated review link has reached its 30-day expiration limit. Please ask the creator to re-issue."
      icon={AlertOctagon}
    />
  );
}
