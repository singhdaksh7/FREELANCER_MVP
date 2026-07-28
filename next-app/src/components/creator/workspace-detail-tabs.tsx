"use client";

import { useState } from "react";
import { Files, MessageSquare, CreditCard, Activity as ActivityIcon, LayoutDashboard } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/format-currency";
import { formatDateTime } from "@/lib/format-date";
import { paymentStatusLabel, workspaceStatusLabel } from "@/lib/status-labels";
import type { WorkspaceDetail } from "@/data-access/workspaces";

export interface WorkspaceDetailTabsProps {
  workspace: WorkspaceDetail;
}

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "files", label: "Files", icon: Files },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "activity", label: "Activity", icon: ActivityIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function WorkspaceDetailTabs({ workspace }: WorkspaceDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="rounded-lg border border-line bg-surface-card">
      <div role="tablist" aria-label="Workspace sections" className="flex overflow-x-auto border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-5 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue ${
              activeTab === tab.id
                ? "border-vault-blue text-vault-blue"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <tab.icon size={15} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeTab === "overview" && (
          <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
              <dt className="text-ink-muted">Client</dt>
              <dd className="font-medium text-ink">
                {workspace.client.name}
                {workspace.client.company ? ` · ${workspace.client.company}` : ""}
              </dd>
              <dt className="text-ink-muted">Client Email</dt>
              <dd className="font-medium text-vault-blue">{workspace.client.email}</dd>
              <dt className="text-ink-muted">Amount</dt>
              <dd className="font-semibold text-ink">{formatINR(workspace.amount)}</dd>
              <dt className="text-ink-muted">Status</dt>
              <dd><StatusBadge status={workspaceStatusLabel(workspace.status)} /></dd>
              <dt className="text-ink-muted">Due Date</dt>
              <dd className="text-ink">{workspace.dueDate ? formatDateTime(workspace.dueDate) : "Not set"}</dd>
              <dt className="text-ink-muted">Watermark Text</dt>
              <dd className="text-ink">{workspace.watermarkText ?? "Not set"}</dd>
              <dt className="text-ink-muted">Created</dt>
              <dd className="text-ink">{formatDateTime(workspace.createdAt)}</dd>
              <dt className="text-ink-muted">Last Updated</dt>
              <dd className="text-ink">{formatDateTime(workspace.updatedAt)}</dd>
            </dl>
            {workspace.description && (
              <div className="border-t border-line pt-4">
                <h3 className="mb-1 text-sm font-semibold text-ink">Description</h3>
                <p className="whitespace-pre-wrap text-sm text-ink-muted">{workspace.description}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "files" && (
          <div id="panel-files" role="tabpanel" aria-labelledby="tab-files">
            <EmptyState
              icon={Files}
              title="No files uploaded yet"
              description="Secure file uploads, previews, and watermarking are coming in Phase 5. This workspace was created without any files."
            />
          </div>
        )}

        {activeTab === "comments" && (
          <div id="panel-comments" role="tabpanel" aria-labelledby="tab-comments">
            <EmptyState
              icon={MessageSquare}
              title="Comments aren't available yet"
              description="Client comments open up once a secure client review link has been shared for this workspace — link sharing is coming in a later phase."
            />
          </div>
        )}

        {activeTab === "payment" && (
          <div id="panel-payment" role="tabpanel" aria-labelledby="tab-payment">
            {workspace.payments.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No payment records yet"
                description="Payment collection isn't wired up in this phase — records will appear here once created."
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {workspace.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between gap-4 rounded-md border border-line p-4 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-ink">{formatINR(payment.amount)}</div>
                      <div className="text-xs text-ink-muted">
                        {payment.paidAt ? `Paid ${formatDateTime(payment.paidAt)}` : `Created ${formatDateTime(payment.createdAt)}`}
                      </div>
                    </div>
                    <StatusBadge status={paymentStatusLabel(payment.status)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div id="panel-activity" role="tabpanel" aria-labelledby="tab-activity">
            {workspace.activity.length === 0 ? (
              <EmptyState icon={ActivityIcon} title="No activity yet" description="Actions taken on this workspace will appear here." />
            ) : (
              <ul className="flex flex-col">
                {workspace.activity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 border-b border-line py-3 text-sm last:border-b-0">
                    <div>
                      <div className="font-semibold text-ink">{entry.label}</div>
                      <div className="text-xs text-ink-muted">by {entry.actorName}</div>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
