import React from "react";
import { Check, Shield, Clock, CreditCard, Lock, PackageCheck } from "lucide-react";

export interface WorkflowProgressProps {
  status: string;
  deliveryMode: string;
}

const STAGES = [
  { id: "setup", label: "Setup", icon: Shield },
  { id: "files", label: "Files", icon: Clock },
  { id: "review", label: "Client Review", icon: Clock },
  { id: "approval", label: "Approval", icon: Check },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "delivery", label: "Delivery", icon: PackageCheck },
];

export function WorkflowProgress({ status, deliveryMode }: WorkflowProgressProps) {
  // Map current status to step index (0-5)
  let activeIndex = 0;
  if (status === "DRAFT") activeIndex = 0;
  else if (status === "FILES_PROCESSING" || status === "READY_FOR_REVIEW") activeIndex = 1;
  else if (status === "IN_REVIEW" || status === "CHANGES_REQUESTED") activeIndex = 2;
  else if (status === "APPROVED") activeIndex = 3;
  else if (status === "PAYMENT_PENDING") activeIndex = 4;
  else if (status === "PAID" || status === "FILES_UNLOCKED" || status === "DELIVERED") activeIndex = 5;

  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-sm overflow-x-auto">
      <ol className="flex items-center justify-between min-w-[600px] gap-2 text-xs font-bold">
        {STAGES.map((stage, idx) => {
          const isCompleted = idx < activeIndex;
          const isCurrent = idx === activeIndex;
          const isUpcoming = idx > activeIndex;

          return (
            <li key={stage.id} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-extrabold ${
                  isCompleted
                    ? "border-success bg-success-bg text-success"
                    : isCurrent
                      ? "border-primary-blue bg-primary-blue text-white"
                      : "border-line bg-app-bg text-muted-text"
                }`}
              >
                {isCompleted ? "✓" : idx + 1}
              </span>
              <span className={`whitespace-nowrap ${isCurrent ? "text-primary-text font-black" : "text-secondary-text"}`}>
                {stage.label}
              </span>
              {idx < STAGES.length - 1 && <div className="h-0.5 flex-1 bg-line ml-2" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
