import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { normalizeEmail } from "@/lib/normalize-email";

export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "DuplicateEmailError";
  }
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
}

/**
 * Creates a new creator account. Runs inside a transaction so the
 * duplicate-email check and the insert are atomic from the application's
 * point of view; the schema's `@unique` constraint on `email` is the
 * ultimate, race-safe guard underneath it (a concurrent duplicate insert
 * fails at the database level even if two requests both pass the
 * in-transaction check).
 */
export async function createUser(input: CreateUserInput) {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new DuplicateEmailError();
    }

    return tx.user.create({
      data: {
        name: input.name,
        email,
        passwordHash,
        role: "CREATOR",
      },
      select: { id: true, name: true, email: true, role: true },
    });
  });
}

/** True for a Prisma unique-constraint violation (error code P2002) — the race-condition fallback to DuplicateEmailError. */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
