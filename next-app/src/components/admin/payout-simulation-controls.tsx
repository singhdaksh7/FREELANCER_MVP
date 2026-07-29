"use client";

import { useActionState } from "react";
import { simulatePayoutStepAction, type PayoutSimulationFormState } from "@/actions/admin-payouts";

const INITIAL_STATE: PayoutSimulationFormState = {};

const STEP_BY_STATUS: Record<string, { step: "markAvailable" | "startPayout" | "completePayout" | "failPayout"; label: string } | null> = {
  PENDING: { step: "markAvailable", label: "Mark Available" },
  AVAILABLE: { step: "startPayout", label: "Start Payout" },
  PROCESSING: { step: "completePayout", label: "Complete Payout" },
  PAID: null,
  FAILED: { step: "startPayout", label: "Retry Payout" },
  CANCELLED: null,
};

/** Test-mode payout simulation controls — see PLATFORM_FEE_AND_PAYOUT_LEDGER.md "Test-mode payout limitation." No real funds are ever transferred. */
export function PayoutSimulationControls({ entryId, status }: { entryId: string; status: string }) {
  const [state, action, pending] = useActionState(simulatePayoutStepAction, INITIAL_STATE);
  const next = STEP_BY_STATUS[status];

  return (
    <div className="flex items-center gap-2">
      {next && (
        <form action={action}>
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="step" value={next.step} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Working…" : next.label}
          </button>
        </form>
      )}
      {status === "PROCESSING" && (
        <form action={action}>
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="step" value="failPayout" />
          <input type="hidden" name="reason" value="Simulated failure (admin-triggered)" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-60"
          >
            Fail
          </button>
        </form>
      )}
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </div>
  );
}
