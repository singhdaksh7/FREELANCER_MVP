import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LinkExpiredPage from "./page";

describe("LinkExpiredPage", () => {
  it("renders its recovery action linking back to the creator dashboard", () => {
    render(<LinkExpiredPage />);

    expect(screen.getByText(/secure link expired/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /return to creator dashboard/i }),
    ).toHaveAttribute("href", "/dashboard");
  });
});
