import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getAuthenticatedCreator, prewarmCombinedWorkerForLogin, headers, redirect } = vi.hoisted(() => ({
  getAuthenticatedCreator: vi.fn(),
  prewarmCombinedWorkerForLogin: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/data-access/auth", () => ({ getAuthenticatedCreator }));
vi.mock("@/lib/worker-wake", () => ({ prewarmCombinedWorkerForLogin }));
vi.mock("next/headers", () => ({ headers }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth/register-form", () => ({ RegisterForm: () => <div>register-form</div> }));

describe("RegisterPage", () => {
  beforeEach(() => {
    getAuthenticatedCreator.mockReset();
    prewarmCombinedWorkerForLogin.mockReset();
    headers.mockReset();
    redirect.mockClear();
    headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.55" }));
  });

  it("triggers the login worker prewarm on render", async () => {
    getAuthenticatedCreator.mockResolvedValue(null);
    const { default: RegisterPage } = await import("./page");

    render(await RegisterPage());

    expect(prewarmCombinedWorkerForLogin).toHaveBeenCalledWith("203.0.113.55");
    expect(screen.getByText("register-form")).toBeInTheDocument();
  });

  it("still renders the register page even if the prewarm helper throws", async () => {
    getAuthenticatedCreator.mockResolvedValue(null);
    prewarmCombinedWorkerForLogin.mockImplementation(() => {
      throw new Error("worker wake exploded");
    });
    const { default: RegisterPage } = await import("./page");

    render(await RegisterPage());

    expect(screen.getByText("register-form")).toBeInTheDocument();
  });
});
