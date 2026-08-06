"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { createUser, DuplicateEmailError, isUniqueConstraintError } from "@/data-access/users";

export interface AuthActionState {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string[]>>;
  values?: { name?: string; email?: string };
}

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

/**
 * Registers a new creator, then immediately establishes a real session
 * (via signIn) and redirects to /dashboard. Never echoes the submitted
 * password back in `values`, and never reveals whether a specific email
 * is already registered beyond the single generic duplicate-account
 * message below.
 */
export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");

  const parsed = registerSchema.safeParse({
    name,
    email,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: { name, email },
    };
  }

  try {
    await createUser(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateEmailError || isUniqueConstraintError(error)) {
      return {
        error: "An account with this email already exists.",
        values: { name: parsed.data.name, email: parsed.data.email },
      };
    }
    console.error("Registration failed:", error);
    return {
      error: "Something went wrong while creating your account. Please try again.",
      values: { name: parsed.data.name, email: parsed.data.email },
    };
  }

  // Establishes a real session. On success this redirects (throws
  // internally) and never returns — do not wrap it in the try/catch
  // above, or the redirect would be swallowed as an "error".
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/dashboard",
  });

  return {};
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");

  const parsed = loginSchema.safeParse({
    email,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    // Deliberately generic even for a malformed email — never confirm or
    // deny whether an account exists for the entered address.
    return { error: GENERIC_LOGIN_ERROR, values: { email } };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: GENERIC_LOGIN_ERROR, values: { email: parsed.data.email } };
    }
    // Anything that isn't an AuthError is Next's internal redirect signal
    // for the successful sign-in above — let it propagate.
    throw error;
  }

  return {};
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false, redirectTo: "/" });

  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.includes("authjs") || cookie.name.includes("next-auth") || cookie.name.includes("session-token")) {
      cookieStore.delete(cookie.name);
    }
  }

  redirect("/");
}
