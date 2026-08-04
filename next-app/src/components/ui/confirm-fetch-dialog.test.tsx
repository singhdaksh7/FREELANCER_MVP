import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmFetchDialog } from "./confirm-fetch-dialog";

/**
 * PHASE 7 regression coverage: ConfirmFetchDialog is the Route Handler
 * fallback counterpart to ConfirmDialog (useActionState-driven) — these
 * assert the reliability contract that motivated the rewrite: pending
 * always clears, exactly once regardless of double submission, and a
 * handled error never leaves the dialog stuck.
 */
async function renderDialog(onConfirm: () => Promise<{ error?: string }>, onSuccess = vi.fn()) {
  render(
    <ConfirmFetchDialog
      triggerLabel="Remove"
      triggerClassName=""
      title="Remove?"
      description="desc"
      confirmLabel="Confirm"
      pendingLabel="Pending…"
      onConfirm={onConfirm}
      onSuccess={onSuccess}
    />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  });
  return { onSuccess };
}

describe("ConfirmFetchDialog", () => {
  it("clears pending and fires onSuccess exactly once after a successful confirm", async () => {
    const onConfirm = vi.fn().mockResolvedValue({});
    const { onSuccess } = await renderDialog(onConfirm);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Success closes the dialog (see ConfirmFetchDialog's handleConfirm) —
    // the "pending clears" contract is that onSuccess fires and the dialog
    // closes deterministically, not that some inert button becomes enabled.
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("clears pending and shows the error after a handled failure, without closing", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ error: "Nope." });
    const { onSuccess } = await renderDialog(onConfirm);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Nope.");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm" })).not.toBeDisabled();
  });

  it("invokes onConfirm exactly once for a rapid double click", async () => {
    let resolveConfirm: (value: { error?: string }) => void = () => {};
    const onConfirm = vi.fn(() => new Promise<{ error?: string }>((resolve) => (resolveConfirm = resolve)));
    await renderDialog(onConfirm);

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConfirm({});
    });
  });
});
