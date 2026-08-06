import React from "react";
import { Check, Shield, Clock, CreditCard, Lock, PackageCheck } from "lucide-react";

export interface WorkflowProgressProps {
  status: string;
  deliveryMode: string;
}

const STAGES_PAYMENT = [
  { id: "setup", label: "Created" },
  { id: "files", label: "Files Ready" },
  { id: "shared", label: "Shared" },
  { id: "approval", label: "Approved" },
  { id: "payment", label: "Payment" },
  { id: "delivery", label: "Completed" },
];

const STAGES_APPROVAL = [
  { id: "setup", label: "Created" },
  { id: "files", label: "Files Ready" },
  { id: "shared", label: "Shared" },
  { id: "approval", label: "Approved" },
  { id: "release", label: "Released" },
  { id: "delivery", label: "Completed" },
];

export function WorkflowProgress({ status, deliveryMode, hasActiveReviewLink = false }: WorkflowProgressProps & { hasActiveReviewLink?: boolean }) {
  const stages = deliveryMode === "PAYMENT_REQUIRED" ? STAGES_PAYMENT : STAGES_APPROVAL;

  let activeIndex = 0;
  if (status === "DRAFT" || status === "PREVIEW_PROCESSING") {
    activeIndex = 0;
  } else if (status === "IN_REVIEW" || status === "CHANGES_REQUESTED") {
    activeIndex = hasActiveReviewLink ? 2 : 1;
  } else if (status === "APPROVED") {
    activeIndex = 3;
  } else if (status === "PAYMENT_PENDING") {
    activeIndex = 4; // Payment
  } else if (status === "AWAITING_CREATOR_RELEASE") {
    activeIndex = 4; // Released step
  } else if (status === "PAID" || status === "FILES_UNLOCKED" || status === "DELIVERED" || status === "CLOSED") {
    activeIndex = 5;
  } else if (status === "CANCELLED") {
    activeIndex = -1;
  }

  if (activeIndex === -1) {
    return <div className="text-xs font-bold text-danger">Cancelled</div>;
  }

  return (
    <div className="flex w-full items-center gap-1.5 overflow-x-auto text-[10px] font-bold sm:text-xs">
      {stages.map((stage, idx) => {
        const isCompleted = idx < activeIndex;
        const isCurrent = idx === activeIndex;

        return (
          <div key={stage.id} className="flex items-center gap-1.5 shrink-0">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] sm:h-5 sm:w-5 sm:text-[10px] ${
                isCompleted
                  ? "border-success bg-success-bg text-success"
                  : isCurrent
                    ? "border-primary-blue bg-primary-blue text-white"
                    : "border-line bg-app-bg text-muted-text"
              }`}
            >
              {isCompleted ? "✓" : idx + 1}
            </span>
            <span className={`whitespace-nowrap ${isCurrent ? "text-primary-text" : "text-secondary-text"}`}>
              {stage.label}
            </span>
            {idx < stages.length - 1 && <div className="h-px w-2 sm:w-4 bg-line" />}
          </div>
        );
      })}
    </div>
  );
}
