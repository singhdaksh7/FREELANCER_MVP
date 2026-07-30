"use server";

import { revalidatePath } from "next/cache";
import { createSupportTicketSchema, clientSupportTicketSchema, supportTicketMessageSchema } from "@/validation/support-ticket";
import {
  createCreatorSupportTicket,
  createClientSupportTicket,
  addCreatorSupportMessage,
  addClientSupportMessage,
  addAdminSupportMessage,
  updateSupportTicketStatus,
  SupportTicketNotFoundError,
} from "@/data-access/support-tickets";
import { authorizeReviewToken, InvalidReviewTokenError, ReviewLinkExpiredError, ReviewLinkRevokedError, WorkspaceUnavailableError } from "@/data-access/review-auth";
import { OwnershipError } from "@/data-access/authorization";
import type { SupportTicketStatus } from "@/generated/prisma/enums";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const TOKEN_INVALID_MESSAGE = "This review link is no longer valid. Please refresh the page.";

function friendlyTokenError(error: unknown): string | null {
  if (
    error instanceof InvalidReviewTokenError ||
    error instanceof ReviewLinkExpiredError ||
    error instanceof ReviewLinkRevokedError ||
    error instanceof WorkspaceUnavailableError
  ) {
    return TOKEN_INVALID_MESSAGE;
  }
  return null;
}

export interface SupportTicketFormState {
  error?: string;
  fieldErrors?: Partial<Record<"category" | "subject" | "description", string[]>>;
  success?: string;
  ticketId?: string;
}

export async function createCreatorSupportTicketAction(
  _prevState: SupportTicketFormState,
  formData: FormData,
): Promise<SupportTicketFormState> {
  const workspaceId = String(formData.get("workspaceId") ?? "") || null;
  const raw = {
    category: String(formData.get("category") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
  const parsed = createSupportTicketSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { id, ticketNumber } = await createCreatorSupportTicket(workspaceId, parsed.data);
    revalidatePath("/support");
    if (workspaceId) revalidatePath(`/workspaces/${workspaceId}`);
    return { success: `Ticket ${ticketNumber} created.`, ticketId: id };
  } catch (error) {
    if (error instanceof OwnershipError) return { error: "This workspace could not be found." };
    console.error("Support ticket creation failed:", error);
    return { error: GENERIC_ERROR };
  }
}

export interface SupportTicketMessageFormState {
  error?: string;
  success?: string;
}

export async function addCreatorSupportMessageAction(
  _prevState: SupportTicketMessageFormState,
  formData: FormData,
): Promise<SupportTicketMessageFormState> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const parsed = supportTicketMessageSchema.safeParse({ body: String(formData.get("body") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };

  try {
    await addCreatorSupportMessage(ticketId, parsed.data.body);
    revalidatePath(`/support/${ticketId}`);
    return { success: "Reply sent." };
  } catch (error) {
    if (error instanceof SupportTicketNotFoundError) return { error: error.message };
    console.error("Support ticket reply failed:", error);
    return { error: GENERIC_ERROR };
  }
}

export async function createClientSupportTicketAction(
  _prevState: SupportTicketFormState,
  formData: FormData,
): Promise<SupportTicketFormState> {
  const token = String(formData.get("token") ?? "");
  const raw = {
    category: String(formData.get("category") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    description: String(formData.get("description") ?? ""),
    reviewerName: String(formData.get("reviewerName") ?? ""),
    reviewerEmail: String(formData.get("reviewerEmail") ?? ""),
  };
  const parsed = clientSupportTicketSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const context = await authorizeReviewToken(token);
    const { id, ticketNumber } = await createClientSupportTicket(context, parsed.data);
    revalidatePath(`/review/${token}`);
    return { success: `Ticket ${ticketNumber} created.`, ticketId: id };
  } catch (error) {
    const tokenMessage = friendlyTokenError(error);
    if (tokenMessage) return { error: tokenMessage };
    console.error("Client support ticket creation failed:", error);
    return { error: GENERIC_ERROR };
  }
}

export async function addClientSupportMessageAction(
  _prevState: SupportTicketMessageFormState,
  formData: FormData,
): Promise<SupportTicketMessageFormState> {
  const token = String(formData.get("token") ?? "");
  const ticketId = String(formData.get("ticketId") ?? "");
  const reviewerName = String(formData.get("reviewerName") ?? "");
  const parsed = supportTicketMessageSchema.safeParse({ body: String(formData.get("body") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };

  try {
    const context = await authorizeReviewToken(token);
    await addClientSupportMessage(context, ticketId, parsed.data.body, reviewerName);
    revalidatePath(`/review/${token}`);
    return { success: "Reply sent." };
  } catch (error) {
    const tokenMessage = friendlyTokenError(error);
    if (tokenMessage) return { error: tokenMessage };
    if (error instanceof SupportTicketNotFoundError) return { error: error.message };
    console.error("Client support ticket reply failed:", error);
    return { error: GENERIC_ERROR };
  }
}

export async function addAdminSupportMessageAction(
  _prevState: SupportTicketMessageFormState,
  formData: FormData,
): Promise<SupportTicketMessageFormState> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const parsed = supportTicketMessageSchema.safeParse({ body: String(formData.get("body") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };

  try {
    await addAdminSupportMessage(ticketId, parsed.data.body);
    revalidatePath(`/admin/support/${ticketId}`);
    return { success: "Reply sent." };
  } catch (error) {
    if (error instanceof SupportTicketNotFoundError) return { error: error.message };
    console.error("Admin support ticket reply failed:", error);
    return { error: GENERIC_ERROR };
  }
}

export async function updateSupportTicketStatusAction(
  _prevState: SupportTicketMessageFormState,
  formData: FormData,
): Promise<SupportTicketMessageFormState> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "") as SupportTicketStatus;

  try {
    await updateSupportTicketStatus(ticketId, status);
    revalidatePath(`/admin/support/${ticketId}`);
    return { success: "Status updated." };
  } catch (error) {
    if (error instanceof SupportTicketNotFoundError) return { error: error.message };
    console.error("Support ticket status update failed:", error);
    return { error: GENERIC_ERROR };
  }
}
