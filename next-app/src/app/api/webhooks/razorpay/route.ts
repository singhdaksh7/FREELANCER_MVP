import { NextRequest, NextResponse } from "next/server";
import { processRazorpayWebhookDelivery } from "@/data-access/webhook-processing";

/**
 * Public Razorpay webhook endpoint — see WEBHOOK_SECURITY.md. No creator
 * session, no review token: authenticity comes entirely from the
 * X-Razorpay-Signature header, verified against the raw request body
 * before any JSON parsing happens (src/data-access/webhook-processing.ts).
 * Never logs the webhook secret or the raw signature/payload contents.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Read the body as raw text BEFORE any parsing — signature verification
  // must run against the exact bytes Razorpay signed.
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const eventId = request.headers.get("x-razorpay-event-id");

  const outcome = await processRazorpayWebhookDelivery({ rawBody, signature, eventId });

  switch (outcome) {
    case "processed":
    case "duplicate":
    case "ignored":
      return NextResponse.json({ ok: true }, { status: 200 });
    case "invalid_signature":
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    case "malformed":
      return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
    case "error":
    default:
      // A non-2xx tells Razorpay to retry — appropriate for a genuine
      // transient failure, and safe to retry since finalizeCapturedPayment
      // is fully idempotent.
      return NextResponse.json({ error: "Processing error." }, { status: 500 });
  }
}
