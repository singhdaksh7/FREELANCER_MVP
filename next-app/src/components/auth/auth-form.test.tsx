import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AuthForm } from "./auth-form";

describe("AuthForm (login mode)", () => {
  it("contains labelled email and password fields", () => {
    render(<AuthForm mode="login" />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("prevents submission and shows a demo toast instead of authenticating", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/demo only/i);
  });
});
