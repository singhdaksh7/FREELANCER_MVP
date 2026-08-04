import React from "react";
import { CheckCircle2, Clock, AlertTriangle, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { workspaceStatusLabel } from "@/lib/status-labels";

export interface ApprovalCardProps {
  status: string;
}

export function ApprovalCard({ status }: ApprovalCardProps) {
  let title = "Awaiting Client Approval";
  let description = "Your client has access to the review link and is reviewing deliverables.";
  let bgClass = "bg-soft-blue/30 border-primary-blue/30";

  if (status === "CHANGES_REQUESTED") {
    title = "Changes Requested";
    description = "Your client submitted feedback or requested revisions on V1.";
    bgClass = "bg-danger-bg/40 border-danger/30";
  } else if (status === "AWAITING_CREATOR_RELEASE") {
    title = "Client Approved — Awaiting Your Release";
    description = 'Your client approved this version. Click "Approve & Release Files" to prepare their secure download.';
    bgClass = "bg-success-bg/40 border-success/30";
  } else if (status === "APPROVED" || status === "PAID" || status === "FILES_UNLOCKED" || status === "DELIVERED") {
    title = "Approved";
    description = "Work has been formally approved by the client.";
    bgClass = "bg-success-bg/40 border-success/30";
  }

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-5 shadow-sm ${bgClass}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-primary-text">{title}</h3>
        <StatusBadge status={workspaceStatusLabel(status)} />
      </div>
      <p className="text-xs text-secondary-text leading-relaxed">{description}</p>
    </div>
  );
}

export interface PaymentCardDetailProps {
  amount: number | null;
  currency: string;
  status: string;
}

export function PaymentCardDetail({ amount, currency, status }: PaymentCardDetailProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-primary-text">Payment Gate</h3>
        <StatusBadge status={workspaceStatusLabel(status)} />
      </div>

      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-xs font-semibold text-secondary-text">Amount</span>
        <span className="text-2xl font-black text-primary-text">
          {amount ? `₹${amount.toLocaleString()}` : "Approval Only"}
        </span>
      </div>
    </div>
  );
}

export interface DeliveryCardProps {
  status: string;
}

export function DeliveryCard({ status }: DeliveryCardProps) {
  let title = "Locked";
  let explanation = "Original files remain locked until client approval and payment.";
  let isUnlocked = false;

  if (status === "PAID" || status === "FILES_UNLOCKED" || status === "DELIVERED") {
    title = "Delivered & Unlocked";
    explanation = "Client has unlocked and downloaded clean original files.";
    isUnlocked = true;
  } else if (status === "APPROVED") {
    title = "Preparing Delivery";
    explanation = "Client approved work. Files will unlock immediately upon payment.";
  } else if (status === "AWAITING_CREATOR_RELEASE") {
    title = "Ready to Release";
    explanation = "Client approved the files. Release them to generate a secure download — no payment required for approval-only projects.";
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-primary-text">Delivery Status</h3>
        <span className={`text-xs font-bold ${isUnlocked ? "text-success" : "text-warning"}`}>
          {title}
        </span>
      </div>
      <p className="text-xs text-secondary-text leading-relaxed">{explanation}</p>
    </div>
  );
}
