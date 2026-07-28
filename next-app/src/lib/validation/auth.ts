import { z } from "zod";

const emailSchema = z.string().trim().min(1, "Email is required.").email("Enter a valid email address.");

const passwordComplexitySchema = z
  .string()
  .min(8, "Password must be at least 8 characters long.")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters long."),
  email: emailSchema,
  password: passwordComplexitySchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;
