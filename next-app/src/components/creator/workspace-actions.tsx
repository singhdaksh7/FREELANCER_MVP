"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, LifeBuoy } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cancelWorkspaceAction, deleteWorkspaceAction, releaseFilesAction, closeWorkspaceAction } from "@/actions/workspaces";

export interface WorkspaceActionsProps {
  workspaceId: string;
  workspaceTitle: string;
  canCancel: boolean;
  canDelete: boolean;
  financiallyLocked: boolean;
  /** APPROVAL_ONLY only — workspace is AWAITING_CREATOR_RELEASE. */
  canReleaseFiles?: boolean;
  /** PREVIEW_ONLY only — workspace is still IN_REVIEW/CHANGES_REQUESTED. */
  canCloseForReview?: boolean;
}

/** Edit / Cancel / Delete / Release / Close / Share actions for the workspace details header. */
export function WorkspaceActions({
  workspaceId,
  workspaceTitle,
  canCancel,
  canDelete,
  financiallyLocked,
  canReleaseFiles = false,
  canCloseForReview = false,
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

      <Link
        href={`/support/new?workspaceId=${workspaceId}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      >
        <LifeBuoy size={14} aria-hidden="true" /> Raise Support Ticket
      </Link>

      {canReleaseFiles && (
        <ConfirmDialog
          triggerLabel="Release Approved Files"
          triggerClassName="rounded-md bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
          title="Release the approved files to your client?"
          description={`This unlocks the exact files/versions approved for "${workspaceTitle}" for your client to download. No online payment is collected for approval-only projects.`}
          confirmLabel="Yes, Release Files"
          pendingLabel="Releasing…"
          action={releaseFilesAction}
          initialState={{}}
          hiddenFields={{ workspaceId }}
          onSuccess={() => router.refresh()}
        />
      )}

      {canCloseForReview && (
        <ConfirmDialog
          triggerLabel="Close Project"
          triggerClassName="rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
          title="Close this project for review?"
          description={`"${workspaceTitle}" will be marked closed and its master review link becomes read-only. Comment and version history remain visible.`}
          confirmLabel="Yes, Close Project"
          pendingLabel="Closing…"
          action={closeWorkspaceAction}
          initialState={{}}
          hiddenFields={{ workspaceId }}
          onSuccess={() => router.refresh()}
        />
      )}

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
