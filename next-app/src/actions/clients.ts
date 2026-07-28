"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clientSchema } from "@/validation/client";
import {
  createClient,
  updateOwnedClient,
  deleteOwnedUnusedClient,
  ClientHasWorkspacesError,
} from "@/data-access/clients";
import { OwnershipError } from "@/data-access/authorization";

export interface ClientFormState {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "company" | "phone" | "notes", string[]>>;
  values?: { name?: string; email?: string; company?: string; phone?: string; notes?: string };
}

export interface DeleteClientFormState {
  error?: string;
  success?: string;
}

function parseClientFormData(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    company: String(formData.get("company") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * Creates a client under the authenticated creator. Validation errors
 * preserve whatever the creator typed (`values`) so the form doesn't clear
 * on a failed submission. Redirects to /clients on success — the list page
 * reads the `flash` query param to show a real success message.
 */
export async function createClientAction(
  _prevState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const raw = parseClientFormData(formData);
  const parsed = clientSchema.safeParse(raw);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values: raw };
  }

  try {
    await createClient(parsed.data);
  } catch (error) {
    console.error("Client creation failed:", error);
    return { error: GENERIC_ERROR, values: raw };
  }

  revalidatePath("/clients");
  redirect(`/clients?flash=${encodeURIComponent(`${parsed.data.name} was added.`)}`);
}

/** Edits an existing client. `clientId` travels as a hidden form field; ownership is re-verified server-side regardless of what the form claims. */
export async function updateClientAction(
  _prevState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const clientId = String(formData.get("clientId") ?? "");
  const raw = parseClientFormData(formData);
  const parsed = clientSchema.safeParse(raw);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values: raw };
  }

  try {
    await updateOwnedClient(clientId, parsed.data);
  } catch (error) {
    if (error instanceof OwnershipError) {
      return { error: "This client could not be found.", values: raw };
    }
    console.error("Client update failed:", error);
    return { error: GENERIC_ERROR, values: raw };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}/edit`);
  redirect(`/clients?flash=${encodeURIComponent(`${parsed.data.name} was updated.`)}`);
}

/**
 * Deletes a client with no associated workspaces. Never redirects (called
 * from a confirm dialog on the /clients list itself) — the caller reads
 * `error`/`success` off the returned state to show a toast.
 */
export async function deleteClientAction(
  _prevState: DeleteClientFormState,
  formData: FormData,
): Promise<DeleteClientFormState> {
  const clientId = String(formData.get("clientId") ?? "");
  const clientName = String(formData.get("clientName") ?? "This client");

  try {
    await deleteOwnedUnusedClient(clientId);
  } catch (error) {
    if (error instanceof ClientHasWorkspacesError) {
      return { error: `${clientName} has workspaces and cannot be deleted.` };
    }
    if (error instanceof OwnershipError) {
      return { error: "This client could not be found." };
    }
    console.error("Client deletion failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/clients");
  return { success: `${clientName} was deleted.` };
}
