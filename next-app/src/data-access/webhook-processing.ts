import "server-only";
import { prisma } from "@/lib/prisma";
import { getPaymentGateway } from "@/payments";
import { finalizeCapturedPayment, recordPaymentFailure } from "./payment-finalization";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Razorpay webhook processing — see WEBHOOK_SECURITY.md. The route handler
 * (`/api/webhooks/razorpay`) only reads the raw body/headers and calls
 * this function; all trust decisions, deduplication, and state changes
 * happen here, always by delegating to the single
 * `finalizeCapturedPayment` service (src/data-access/payment-finalization.ts)
 * — never a separate, second implementation of "mark this payment PAID."
 */

export type WebhookOutcome = "processed" | "duplicate" | "ignored" | "invalid_signature" | "malformed" | "error";

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  error_code?: string | null;
  error_description?: string | null;
}

interface RazorpayWebhookBody {
  event: string;
  payload?: { payment?: { entity?: RazorpayPaymentEntity } };
}

function extractPaymentEntity(body: unknown): RazorpayPaymentEntity | null {
  const entity = (body as RazorpayWebhookBody | undefined)?.payload?.payment?.entity;
  if (!entity || typeof entity.id !== "string" || typeof entity.order_id !== "string") return null;
  return entity;
}

async function tryCreateWebhookEventRecord(data: Prisma.WebhookEventCreateInput): Promise<{ created: boolean; id: string | null }> {
  try {
    const row = await prisma.webhookEvent.create({ data });
    return { created: true, id: row.id };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { created: false, id: null };
    throw error;
  }
}

export async function processRazorpayWebhookDelivery(input: {
  rawBody: string;
  signature: string | null;
  eventId: string | null;
}): Promise<WebhookOutcome> {
  if (!input.signature || !input.eventId) {
    return "invalid_signature";
  }

  // Signature verification happens against the exact raw body — the JSON
  // below is never parsed (let alone acted on) before this check passes.
  // See WEBHOOK_SECURITY.md "Raw-body verification."
  const signatureValid = getPaymentGateway().verifyWebhookSignature({ rawBody: input.rawBody, signature: input.signature });

  if (!signatureValid) {
    await tryCreateWebhookEventRecord({
      externalEventId: input.eventId,
      eventType: "unknown",
      signatureVerified: false,
      payload: { note: "Signature verification failed." },
      processingStatus: "FAILED",
      processingError: "Invalid webhook signature.",
      processedAt: new Date(),
    });
    return "invalid_signature";
  }

  let body: unknown;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    await tryCreateWebhookEventRecord({
      externalEventId: input.eventId,
      eventType: "unknown",
      signatureVerified: true,
      payload: { note: "Malformed JSON body." },
      processingStatus: "FAILED",
      processingError: "Malformed webhook payload.",
      processedAt: new Date(),
    });
    return "malformed";
  }

  const eventType = typeof (body as RazorpayWebhookBody).event === "string" ? (body as RazorpayWebhookBody).event : "unknown";

  let webhookEventId: string;
  const { created, id: newId } = await tryCreateWebhookEventRecord({
    externalEventId: input.eventId,
    eventType,
    signatureVerified: true,
    payload: body as Prisma.InputJsonValue,
    processingStatus: "PROCESSING",
  });

  if (created) {
    webhookEventId = newId!;
  } else {
    // Same x-razorpay-event-id seen before. A delivery that already
    // PROCESSED successfully is never reprocessed (idempotent no-op) — see
    // WEBHOOK_SECURITY.md "Event-ID deduplication." A delivery that
    // previously FAILED/was left mid-processing is retried: safe because
    // finalizeCapturedPayment (the only state-changing call in
    // handleEvent) is itself fully idempotent against an already-PAID
    // payment, so retrying can never double-apply an effect.
    const existing = await prisma.webhookEvent.findUniqueOrThrow({ where: { externalEventId: input.eventId } });
    if (existing.processingStatus === "PROCESSED") return "duplicate";
    webhookEventId = existing.id;
    await prisma.webhookEvent.update({ where: { id: webhookEventId }, data: { processingStatus: "PROCESSING", processingError: null } });
  }

  try {
    const outcome = await handleEvent(eventType, body);
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processingStatus: outcome === "processed" ? "PROCESSED" : "IGNORED", processedAt: new Date() },
    });
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error.";
    console.error("Webhook processing failed:", error);
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processingStatus: "FAILED", processingError: message, processedAt: new Date() },
    });
    return "error";
  }
}

async function handleEvent(eventType: string, body: unknown): Promise<"processed" | "ignored"> {
  switch (eventType) {
    case "payment.captured":
    case "order.paid": {
      const entity = extractPaymentEntity(body);
      if (!entity || entity.status !== "captured") return "ignored";
      await finalizeCapturedPayment({
        gatewayOrderId: entity.order_id,
        gatewayPaymentId: entity.id,
        amountSubunits: BigInt(entity.amount),
        currency: entity.currency,
      });
      return "processed";
    }
    case "payment.failed": {
      const entity = extractPaymentEntity(body);
      if (!entity) return "ignored";
      await recordPaymentFailure(entity.order_id, entity.error_code ?? null, entity.error_description ?? null);
      return "processed";
    }
    // payment.authorized and everything else never unlocks/captures —
    // deliberately ignored. See WEBHOOK_SECURITY.md "Out-of-order handling."
    default:
      return "ignored";
  }
}
