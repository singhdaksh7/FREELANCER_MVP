"use client";

import { useActionState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitRevisionAction, type RevisionActionState } from "@/actions/revisions";
import { formatDateTime } from "@/lib/format-date";
import type { ActiveChangeRequest } from "@/data-access/change-requests";

const INITIAL_STATE: RevisionActionState = {};

export interface ChangeRequestBannerProps {
  workspaceId: string;
  changeRequest: ActiveChangeRequest;
  /** True once at least one file has a new, READY, not-yet-submitted current version — gates "Submit Revision." */
  canSubmitRevision: boolean;
  /**
   * Called as soon as submission succeeds. The parent (`WorkspaceDetailTabs`)
   * uses this to keep a confirmation visible immediately — necessary
   * because the Server Action's `revalidatePath` refetches
   * `activeChangeRequest`/`workspace.status`, which can unmount this whole
   * banner (its render condition is `status === CHANGES_REQUESTED`) before
   * its own internal success state ever gets a chance to paint.
   */
  onSubmitted: () => void;
}

/** Shown on the workspace Files tab when status is CHANGES_REQUESTED — active request summary + Upload/Submit affordance. */
export function ChangeRequestBanner({ workspaceId, changeRequest, canSubmitRevision, onSubmitted }: ChangeRequestBannerProps) {
  const [state, action, pending] = useActionState(submitRevisionAction, INITIAL_STATE);

  useEffect(() => {
    if (state.success) onSubmitted();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the action's result changes
  }, [state]);

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-bg p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-ink">
            Changes requested{changeRequest.reviewerName ? ` by ${changeRequest.reviewerName}` : ""}
          </p>
          <p className="text-xs text-ink-muted">{formatDateTime(changeRequest.requestedAt)}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{changeRequest.summary}</p>
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        Upload a new version for each affected file below, then submit the revision for review.
      </p>

      {state.error && <p className="text-xs font-medium text-danger">{state.error}</p>}
      {state.success && <p className="text-xs font-medium text-success">{state.success}</p>}

      <form action={action} className="self-start">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <Button type="submit" disabled={pending || !canSubmitRevision}>
          {pending ? "Submitting…" : "Submit Revision for Review"}
        </Button>
      </form>
      {!canSubmitRevision && (
        <p className="text-xs text-ink-muted">Upload at least one new, ready file version before submitting.</p>
      )}
    </div>
  );
}
