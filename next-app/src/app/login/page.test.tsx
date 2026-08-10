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
vi.mock("@/components/auth/login-form", () => ({ LoginForm: () => <div>login-form</div> }));

describe("LoginPage", () => {
  beforeEach(() => {
    getAuthenticatedCreator.mockReset();
    prewarmCombinedWorkerForLogin.mockReset();
    headers.mockReset();
    redirect.mockClear();
    headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.42" }));
  });

  it("triggers the login worker prewarm on render", async () => {
    getAuthenticatedCreator.mockResolvedValue(null);
    const { default: LoginPage } = await import("./page");

    render(await LoginPage());

    expect(prewarmCombinedWorkerForLogin).toHaveBeenCalledWith("203.0.113.42");
    expect(screen.getByText("login-form")).toBeInTheDocument();
  });

  it("still renders the login page even if the prewarm helper throws", async () => {
    getAuthenticatedCreator.mockResolvedValue(null);
    prewarmCombinedWorkerForLogin.mockImplementation(() => {
      throw new Error("worker wake exploded");
    });
    const { default: LoginPage } = await import("./page");

    render(await LoginPage());

    expect(screen.getByText("login-form")).toBeInTheDocument();
  });
});
