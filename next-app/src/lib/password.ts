import "server-only";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** Hashes a plaintext password with bcrypt. Never log or persist the plaintext input. */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

/** Verifies a plaintext password against a stored bcrypt hash. */
export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
