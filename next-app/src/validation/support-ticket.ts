import { z } from "zod";

export const SUPPORT_TICKET_CATEGORIES = ["PAYMENT", "DELIVERY", "QUALITY_DISPUTE", "FILE_PROCESSING", "ACCOUNT", "OTHER"] as const;

const trimmedRequired = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);

export const createSupportTicketSchema = z.object({
  category: z.enum(SUPPORT_TICKET_CATEGORIES, { error: "Select a category." }),
  subject: trimmedRequired("Subject", 150),
  description: trimmedRequired("Description", 4000),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const clientSupportTicketSchema = createSupportTicketSchema.extend({
  reviewerName: z.string().trim().max(120).optional(),
  reviewerEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
});
export type ClientSupportTicketInput = z.infer<typeof clientSupportTicketSchema>;

export const supportTicketMessageSchema = z.object({
  body: trimmedRequired("Message", 4000),
});
export type SupportTicketMessageInput = z.infer<typeof supportTicketMessageSchema>;
