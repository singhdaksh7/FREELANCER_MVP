import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "./page";
import { DASHBOARD_SUMMARY } from "@/data/mock";
import { formatINR } from "@/lib/format-currency";

describe("DashboardPage", () => {
  it("renders metric values computed from the mock workspace records, not hardcoded figures", () => {
    render(<DashboardPage />);

    expect(screen.getByText(formatINR(DASHBOARD_SUMMARY.outstandingAmount))).toBeInTheDocument();
    expect(
      screen.getAllByText(formatINR(DASHBOARD_SUMMARY.receivedRevenue)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(String(DASHBOARD_SUMMARY.awaitingReviewCount)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(String(DASHBOARD_SUMMARY.changesRequestedCount)).length,
    ).toBeGreaterThan(0);
  });

  it("greets the creator by name", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/welcome back, arjun raj/i);
  });
});
