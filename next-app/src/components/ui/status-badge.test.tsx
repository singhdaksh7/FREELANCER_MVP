import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";
import { getStatusStyle } from "@/lib/status-config";

describe("StatusBadge", () => {
  it("renders the correct label text", () => {
    render(<StatusBadge status="In Review" />);
    expect(screen.getByText("In Review")).toBeInTheDocument();
  });

  it("resolves its colors from the centralized status configuration, not a local mapping", () => {
    render(<StatusBadge status="Paid" />);
    const badge = screen.getByText("Paid");
    const expected = getStatusStyle("Paid");

    expect(badge).toHaveStyle({ backgroundColor: expected.background });
    expect(badge).toHaveStyle({ color: expected.color });
  });

  it("falls back to the default style for an unknown status instead of throwing", () => {
    render(<StatusBadge status="Some Unmapped Status" />);
    expect(screen.getByText("Some Unmapped Status")).toBeInTheDocument();
  });
});
