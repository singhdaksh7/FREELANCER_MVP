import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentTable } from "./payment-table";
import type { PaymentListItem } from "@/data-access/payments";
import { getStatusStyle } from "@/lib/status-config";
import { paymentStatusLabel } from "@/lib/status-labels";

const PAYMENTS: PaymentListItem[] = [
  {
    id: "pay_101",
    workspaceId: "ws_product_pkg",
    workspaceTitle: "Product Packaging Design",
    clientName: "Karan Mehta",
    amount: 30000,
    currency: "INR",
    status: "PAID",
    paidAt: "2026-07-18T15:45:00.000Z",
    createdAt: "2026-07-17T11:00:00.000Z",
  },
  {
    id: "pay_102",
    workspaceId: "ws_ecommerce_ui",
    workspaceTitle: "E-commerce Website UI",
    clientName: "Priya Verma",
    amount: 45000,
    currency: "INR",
    status: "PENDING",
    paidAt: null,
    createdAt: "2026-07-27T16:25:00.000Z",
  },
];

describe("PaymentTable", () => {
  it("renders payment status using the centralized status configuration", () => {
    render(<PaymentTable payments={PAYMENTS} caption="Payments" onDeferredAction={vi.fn()} />);

    const paidPayment = PAYMENTS.find((p) => p.status === "PAID")!;
    const badge = screen.getByText(paymentStatusLabel(paidPayment.status));
    const expected = getStatusStyle(paymentStatusLabel(paidPayment.status));

    expect(badge).toHaveStyle({ backgroundColor: expected.background, color: expected.color });
  });

  it("disables the receipt action for payments that have not settled", () => {
    render(<PaymentTable payments={PAYMENTS} caption="Payments" onDeferredAction={vi.fn()} />);

    const pendingPayment = PAYMENTS.find((p) => p.status !== "PAID")!;
    const row = screen.getByText(pendingPayment.workspaceTitle).closest("tr");
    expect(row).not.toBeNull();
    expect(row!.querySelector("button")).toBeDisabled();
  });

  it("enables the receipt action for settled payments", () => {
    render(<PaymentTable payments={PAYMENTS} caption="Payments" onDeferredAction={vi.fn()} />);

    const paidPayment = PAYMENTS.find((p) => p.status === "PAID")!;
    const row = screen.getByText(paidPayment.workspaceTitle).closest("tr");
    expect(row!.querySelector("button")).toBeEnabled();
  });
});
