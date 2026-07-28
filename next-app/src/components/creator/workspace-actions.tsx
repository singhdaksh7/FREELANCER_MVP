"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cancelWorkspaceAction, deleteWorkspaceAction } from "@/actions/workspaces";

export interface WorkspaceActionsProps {
  workspaceId: string;
  workspaceTitle: string;
  canCancel: boolean;
  canDelete: boolean;
  financiallyLocked: boolean;
}

/** Edit / Cancel / Delete / Share actions for the workspace details header. */
export function WorkspaceActions({
  workspaceId,
  workspaceTitle,
  canCancel,
  canDelete,
  financiallyLocked,
}: WorkspaceActionsProps) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/workspaces/${workspaceId}/edit`}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      >
        <Pencil size={14} aria-hidden="true" /> Edit Workspace
      </Link>

      {canCancel && (
        <ConfirmDialog
          triggerLabel="Cancel Workspace"
          triggerClassName="rounded-md border border-line px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
          title="Cancel this workspace?"
          description={`"${workspaceTitle}" will be marked Cancelled. This does not delete any payment or activity history.`}
          confirmLabel="Yes, Cancel Workspace"
          pendingLabel="Cancelling…"
          action={cancelWorkspaceAction}
          initialState={{}}
          hiddenFields={{ workspaceId }}
          destructive
          onSuccess={() => router.refresh()}
        />
      )}

      {canDelete && (
        <ConfirmDialog
          triggerLabel="Delete Draft"
          triggerClassName="rounded-md border border-line px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
          title="Permanently delete this draft?"
          description={`"${workspaceTitle}" has no payments or activity beyond creation, so it can be deleted permanently. This cannot be undone.`}
          confirmLabel="Delete Permanently"
          pendingLabel="Deleting…"
          action={deleteWorkspaceAction}
          initialState={{}}
          hiddenFields={{ workspaceId }}
          destructive
        />
      )}

      {financiallyLocked && (
        <span className="text-xs text-ink-muted">Paid workspaces cannot be cancelled or deleted.</span>
      )}
    </div>
  );
}
