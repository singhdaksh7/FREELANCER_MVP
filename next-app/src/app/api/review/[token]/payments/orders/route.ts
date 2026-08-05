import { NextRequest, NextResponse } from "next/server";
import {
  authorizeReviewToken,
  InvalidReviewTokenError,
  ReviewLinkExpiredError,
  ReviewLinkRevokedError,
  WorkspaceUnavailableError,
} from "@/data-access/review-auth";
import { createPaymentOrder } from "@/data-access/payment-orders";
import { checkRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-errors";

/**
 * Step 1 of the Phase 7 payment flow — see PAYMENT_ARCHITECTURE.md "Order
 * lifecycle." Route handler (not a Server Action) since Checkout's client
 * JS calls this via `fetch()` before opening the Razorpay modal. The only
 * input is the already-validated review token in the URL; amount,
 * currency, and workspace identity are all re-derived server-side.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    await checkRateLimit({ bucket: "payment-order-create", identifier: token, max: 8, windowSeconds: 60 });
    const context = await authorizeReviewToken(token);
    const checkout = await createPaymentOrder(context);
    return NextResponse.json(checkout, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, {
      InvalidReviewTokenError: { status: 404, message: new InvalidReviewTokenError().message },
      ReviewLinkExpiredError: { status: 404, message: new ReviewLinkExpiredError().message },
      ReviewLinkRevokedError: { status: 404, message: new ReviewLinkRevokedError().message },
      WorkspaceUnavailableError: { status: 404, message: new WorkspaceUnavailableError().message },
      WorkspaceNotApprovedError: { status: 409 },
      NoApprovalFoundError: { status: 409 },
      ApprovalSnapshotInvalidError: { status: 409 },
      PaymentOrderCreationFailedError: { status: 502 },
      PaymentTemporarilyUnavailableError: { status: 503 },
      RateLimitExceededError: { status: 429, message: new RateLimitExceededError().message },
    });
  }
}
