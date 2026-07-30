/**
 * Single source of truth for user-visible product naming. Every screen,
 * watermark, email/notification copy, and Razorpay checkout description
 * must read from here rather than hardcoding "INLAY" (or an old
 * "Project Vault" string) inline, so a future rename only touches this file.
 */
export const BRAND = {
  productName: process.env.NEXT_PUBLIC_APP_NAME || "INLAY",
  tagline:
    "Payment-gated digital file-delivery platform for freelancers and creative agencies.",
  watermarkText: "INLAY PREVIEW",
  supportName: "INLAY Support",
  adminName: "INLAY Administration",
} as const;
