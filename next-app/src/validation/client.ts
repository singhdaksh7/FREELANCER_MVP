import { z } from "zod";

/**
 * Client mutation validation. Every string field is trimmed; email is also
 * lowercased so storage/lookup stays consistent with normalizeEmail() used
 * elsewhere in the app. Max lengths are deliberately generous but bounded —
 * these are free-text fields a creator types, not attacker-controlled
 * payloads, but an unbounded TEXT column is still worth capping.
 */

const trimmedRequired = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);

const trimmedOptional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .transform((value) => (value ? value : undefined));

export const clientSchema = z.object({
  name: trimmedRequired("Name", 120),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .max(254, "Email must be 254 characters or fewer.")
    .transform((value) => value.toLowerCase()),
  company: trimmedOptional(120),
  phone: trimmedOptional(30),
  notes: trimmedOptional(2000),
});

export type ClientInput = z.infer<typeof clientSchema>;
