import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentTable } from "./payment-table";
import { PAYMENTS } from "@/data/mock";
import { getStatusStyle } from "@/lib/status-config";

describe("PaymentTable", () => {
  it("renders payment status using the centralized status configuration", () => {
    render(<PaymentTable payments={PAYMENTS} caption="Payments" onDeferredAction={vi.fn()} />);

    const completedPayment = PAYMENTS.find((p) => p.status === "Completed");
    expect(completedPayment).toBeDefined();

    const badge = screen.getByText(completedPayment!.status);
    const expected = getStatusStyle(completedPayment!.status);

    expect(badge).toHaveStyle({ backgroundColor: expected.background, color: expected.color });
  });

  it("disables the receipt action for payments that have not settled", () => {
    render(<PaymentTable payments={PAYMENTS} caption="Payments" onDeferredAction={vi.fn()} />);

    const pendingPayment = PAYMENTS.find((p) => p.status !== "Completed");
    expect(pendingPayment).toBeDefined();

    const row = screen.getByText(pendingPayment!.workspaceTitle).closest("tr");
    expect(row).not.toBeNull();
    expect(row!.querySelector("button")).toBeDisabled();
  });
});
