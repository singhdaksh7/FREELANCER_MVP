import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authorizeReviewToken,
  InvalidReviewTokenError,
  ReviewLinkExpiredError,
  ReviewLinkRevokedError,
  WorkspaceUnavailableError,
} from "@/data-access/review-auth";
import { verifyCheckoutCallback } from "@/data-access/payment-verification";
import { checkRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-errors";

const bodySchema = z.object({
  razorpay_payment_id: z.string().trim().min(1).max(100),
  razorpay_order_id: z.string().trim().min(1).max(100),
  razorpay_signature: z.string().trim().min(1).max(256),
});

/**
 * Checkout-callback signature verification — see PAYMENT_ARCHITECTURE.md
 * "Signature verification." This endpoint NEVER marks a payment PAID —
 * see src/data-access/payment-verification.ts's doc comment. It only
 * confirms the Checkout callback is authentic for a Payment this app
 * itself created for this token's workspace.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
  }

  try {
    await checkRateLimit({ bucket: "payment-checkout-verify", identifier: token, max: 15, windowSeconds: 60 });
    const context = await authorizeReviewToken(token);
    const result = await verifyCheckoutCallback(context, {
      orderId: parsed.data.razorpay_order_id,
      paymentId: parsed.data.razorpay_payment_id,
      signature: parsed.data.razorpay_signature,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error, {
      InvalidReviewTokenError: { status: 404, message: new InvalidReviewTokenError().message },
      ReviewLinkExpiredError: { status: 404, message: new ReviewLinkExpiredError().message },
      ReviewLinkRevokedError: { status: 404, message: new ReviewLinkRevokedError().message },
      WorkspaceUnavailableError: { status: 404, message: new WorkspaceUnavailableError().message },
      UnknownOrderError: { status: 404, message: "No matching payment was found for this order." },
      InvalidSignatureError: { status: 400, message: "This payment could not be verified. Please contact the creator if you were charged." },
      RateLimitExceededError: { status: 429, message: new RateLimitExceededError().message },
    });
  }
}
