import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

/**
 * Next.js renders app/not-found.tsx for any URL that doesn't match a
 * route (and whenever a segment calls notFound()). We can't spin up a
 * full Next server in a unit test, so this verifies the component that
 * Next.js's routing wires up for unknown routes renders the expected
 * "not found" UI with a way back into the app.
 */
describe("NotFound", () => {
  it("renders 404 messaging and a way back into the app", () => {
    render(<NotFound />);

    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
    expect(screen.getByText(/\[404\]/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home landing/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
