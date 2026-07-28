import { describe, expect, it, vi } from "vitest";

// The real "next-auth" package's AuthError import chain pulls in
// "next/server", which Vitest's plain Node resolution (unlike Next's own
// bundler) can't resolve — mock the package with a lightweight stand-in
// class so `instanceof AuthError` checks inside src/actions/auth.ts still
// work against the same class reference used here in the test.
const { AuthError } = vi.hoisted(() => ({
  AuthError: class AuthError extends Error {
    type: string;
    constructor(type: string) {
      super(type);
      this.type = type;
    }
  },
}));
vi.mock("next-auth", () => ({ AuthError }));

const { signIn, signOut } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/auth", () => ({ signIn, signOut }));

const { createUser, DuplicateEmailError, isUniqueConstraintError } = vi.hoisted(() => {
  class DuplicateEmailError extends Error {}
  return {
    createUser: vi.fn(),
    DuplicateEmailError,
    isUniqueConstraintError: vi.fn(() => false),
  };
});
vi.mock("@/data-access/users", () => ({ createUser, DuplicateEmailError, isUniqueConstraintError }));

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("loginAction", () => {
  it("returns a generic error for malformed input, without calling signIn", async () => {
    const { loginAction } = await import("./auth");
    const result = await loginAction({}, formData({ email: "not-an-email", password: "" }));

    expect(result.error).toBe("Invalid email or password.");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("returns the same generic error for a CredentialsSignin AuthError, never revealing the cause", async () => {
    signIn.mockRejectedValueOnce(new AuthError("CredentialsSignin"));
    const { loginAction } = await import("./auth");

    const result = await loginAction(
      {},
      formData({ email: "arjun@example.com", password: "wrong-password" }),
    );

    expect(result.error).toBe("Invalid email or password.");
  });

  it("re-throws anything that is not an AuthError (Next's internal redirect signal)", async () => {
    class FakeRedirectSignal extends Error {}
    signIn.mockRejectedValueOnce(new FakeRedirectSignal("NEXT_REDIRECT"));
    const { loginAction } = await import("./auth");

    await expect(
      loginAction({}, formData({ email: "arjun@example.com", password: "Demo@12345" })),
    ).rejects.toThrow(FakeRedirectSignal);
  });
});

describe("registerAction", () => {
  it("returns field errors for invalid input without touching the database", async () => {
    const { registerAction } = await import("./auth");
    const result = await registerAction(
      {},
      formData({ name: "A", email: "not-an-email", password: "short" }),
    );

    expect(result.fieldErrors).toBeDefined();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("shows a duplicate-account message and never echoes the password back", async () => {
    createUser.mockRejectedValueOnce(new DuplicateEmailError());
    const { registerAction } = await import("./auth");

    const result = await registerAction(
      {},
      formData({ name: "Arjun Raj", email: "arjun@example.com", password: "Demo@12345" }),
    );

    expect(result.error).toBe("An account with this email already exists.");
    expect(result.values).toEqual({ name: "Arjun Raj", email: "arjun@example.com" });
    expect(result.values).not.toHaveProperty("password");
  });

  it("establishes a session after successful registration", async () => {
    createUser.mockResolvedValueOnce({
      id: "usr_x",
      name: "Arjun Raj",
      email: "arjun@example.com",
      role: "CREATOR",
    });
    signIn.mockResolvedValueOnce(undefined);
    const { registerAction } = await import("./auth");

    await registerAction(
      {},
      formData({ name: "Arjun Raj", email: "arjun@example.com", password: "Demo@12345" }),
    );

    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "arjun@example.com",
      password: "Demo@12345",
      redirectTo: "/dashboard",
    });
  });
});

describe("logoutAction", () => {
  it("ends the session via signOut and redirects to the public landing page", async () => {
    const { logoutAction } = await import("./auth");
    await logoutAction();

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});
