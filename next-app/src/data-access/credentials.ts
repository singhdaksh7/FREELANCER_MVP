import "server-only";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { normalizeEmail } from "@/lib/normalize-email";

export interface VerifiedCredentialsUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * Verifies email/password against the database. Returns `null` for both
 * "no such account" and "wrong password" — deliberately indistinguishable,
 * so callers (Auth.js's `authorize()`, tests) can never leak which one
 * occurred. Extracted out of src/auth.ts specifically so it's testable
 * on its own, without importing the full Auth.js/next-auth module graph.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<VerifiedCredentialsUser | null> {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return null;

  const isValidPassword = await verifyPassword(password, user.passwordHash);
  if (!isValidPassword) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
