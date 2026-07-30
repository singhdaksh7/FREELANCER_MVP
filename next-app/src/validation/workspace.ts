import { z } from "zod";

/**
 * Workspace mutation validation (Phase 4 scope — project/client/protection
 * metadata + payment terms only; see MUTATION_ARCHITECTURE.md). `amount` is
 * validated as a decimal-safe string (not `z.number()`) so it never passes
 * through binary floating point before reaching Prisma's Decimal column —
 * see src/lib/decimal.ts for the corresponding safe conversion helper used
 * once the string has passed this schema.
 */

// Every currency-display helper in this app (formatINR, etc.) is
// hardcoded to the ₹ / en-IN format — see src/lib/format-currency.ts. Until
// that's genuinely multi-currency, the supported set here is deliberately
// limited to "INR" rather than accepting a currency the UI can't actually
// render correctly (see MUTATION_ARCHITECTURE.md).
export const SUPPORTED_CURRENCIES = ["INR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(150, "Title must be 150 characters or fewer.");

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be 2000 characters or fewer.")
  .optional()
  .transform((value) => (value ? value : undefined));

const watermarkTextSchema = z
  .string()
  .trim()
  .max(200, "Watermark text must be 200 characters or fewer.")
  .optional()
  .transform((value) => (value ? value : undefined));

/**
 * Phase 7.5 — a workspace's amount is conditionally required depending on
 * DeliveryMode (see DELIVERY_MODES.md): required and greater than zero for
 * PAYMENT_REQUIRED, optional for APPROVAL_ONLY/PREVIEW_ONLY. This schema
 * validates the *shape* of a submitted amount when one is present; the
 * required-for-PAYMENT_REQUIRED rule is enforced by the superRefine below,
 * where deliveryMode is in scope.
 */
const amountSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || AMOUNT_PATTERN.test(value), "Enter a valid amount with up to 2 decimal places.")
  .refine((value) => value === undefined || Number(value) > 0, "Amount must be greater than zero.")
  .refine((value) => value === undefined || Number(value) <= 9999999999.99, "Amount is too large.");

const currencySchema = z.enum(SUPPORTED_CURRENCIES, {
  error: "Select a supported currency.",
});

const dueDateSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "Enter a valid due date.");

const clientIdSchema = z.string().trim().min(1, "Select a client.");

export const DELIVERY_MODES = ["PAYMENT_REQUIRED", "APPROVAL_ONLY", "PREVIEW_ONLY"] as const;
export type DeliveryModeInput = (typeof DELIVERY_MODES)[number];

const deliveryModeSchema = z.enum(DELIVERY_MODES, { error: "Select a delivery type." });

const workspaceBaseSchema = z.object({
  title: titleSchema,
  clientId: clientIdSchema,
  description: descriptionSchema,
  deliveryMode: deliveryModeSchema,
  currency: currencySchema,
  amount: amountSchema,
  dueDate: dueDateSchema,
  watermarkText: watermarkTextSchema,
});

/**
 * PAYMENT_REQUIRED requires an amount (section 5 of REQUIREMENTS_ALIGNMENT.md
 * — "Amount required, amount greater than zero"); APPROVAL_ONLY and
 * PREVIEW_ONLY never require one. The shape/positivity of a *submitted*
 * amount is already checked by amountSchema above regardless of mode.
 */
function requireAmountForPaymentRequired(
  data: { deliveryMode: DeliveryModeInput; amount: string | undefined },
  ctx: z.RefinementCtx,
) {
  if (data.deliveryMode === "PAYMENT_REQUIRED" && data.amount === undefined) {
    ctx.addIssue({ code: "custom", path: ["amount"], message: "Amount is required for payment-required workspaces." });
  }
}

export const workspaceCreateSchema = workspaceBaseSchema.superRefine(requireAmountForPaymentRequired);
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;

/** Same shape as create — every editable field may be resubmitted. Financial-lock enforcement (amount/currency) happens in the data-access layer, where the workspace's current status is known. */
export const workspaceUpdateSchema = workspaceBaseSchema.superRefine(requireAmountForPaymentRequired);
export type WorkspaceUpdateInput = z.infer<typeof workspaceUpdateSchema>;
