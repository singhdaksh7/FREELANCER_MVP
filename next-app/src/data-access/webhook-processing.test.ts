import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeWebhookSignature } from "@/payments/payment-signatures";
import { FAKE_WEBHOOK_SECRET } from "@/payments/fake-payment-gateway";

/**
 * Unit tests (mocked Prisma + the real fake gateway's signature logic) for
 * webhook deduplication, out-of-order handling, and event routing — see
 * WEBHOOK_SECURITY.md. Real end-to-end webhook delivery against a live
 * database is covered by src/data-access/payment-workflow.integration.test.ts.
 */

const webhookEventRows = new Map<string, { id: string; processingStatus: string }>();
let rowCounter = 0;

const prismaMock = {
  webhookEvent: {
    create: vi.fn(async ({ data }: { data: { externalEventId: string; processingStatus: string } }) => {
      if (webhookEventRows.has(data.externalEventId)) {
        const err = new Error("Unique constraint failed") as Error & { code?: string };
        err.code = "P2002";
        throw err;
      }
      rowCounter += 1;
      const row = { id: `evt_row_${rowCounter}`, processingStatus: data.processingStatus };
      webhookEventRows.set(data.externalEventId, row);
      return row;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { externalEventId: string } }) => {
      const row = webhookEventRows.get(where.externalEventId);
      if (!row) throw new Error("not found");
      return { ...row, externalEventId: where.externalEventId };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { processingStatus?: string } }) => {
      for (const row of webhookEventRows.values()) {
        if (row.id === where.id && data.processingStatus) row.processingStatus = data.processingStatus;
      }
      return {};
    }),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const finalizeCapturedPaymentMock = vi.fn();
const recordPaymentFailureMock = vi.fn();
vi.mock("./payment-finalization", () => ({
  finalizeCapturedPayment: (...args: unknown[]) => finalizeCapturedPaymentMock(...args),
  recordPaymentFailure: (...args: unknown[]) => recordPaymentFailureMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  webhookEventRows.clear();
  rowCounter = 0;
});

function signedBody(body: object): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(body);
  return { rawBody, signature: computeWebhookSignature(rawBody, FAKE_WEBHOOK_SECRET) };
}

describe("processRazorpayWebhookDelivery", () => {
  it("rejects a missing signature header without ever parsing the body", async () => {
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const outcome = await processRazorpayWebhookDelivery({ rawBody: "{}", signature: null, eventId: "evt_1" });
    expect(outcome).toBe("invalid_signature");
  });

  it("rejects a missing event-id header", async () => {
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const { rawBody, signature } = signedBody({ event: "payment.captured" });
    const outcome = await processRazorpayWebhookDelivery({ rawBody, signature, eventId: null });
    expect(outcome).toBe("invalid_signature");
  });

  it("rejects an invalid signature", async () => {
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const outcome = await processRazorpayWebhookDelivery({ rawBody: "{}", signature: "not-a-real-signature", eventId: "evt_1" });
    expect(outcome).toBe("invalid_signature");
  });

  it("rejects a malformed (non-JSON) body even with a genuinely valid signature", async () => {
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const rawBody = "not json {{{";
    const signature = computeWebhookSignature(rawBody, FAKE_WEBHOOK_SECRET);
    const outcome = await processRazorpayWebhookDelivery({ rawBody, signature, eventId: "evt_1" });
    expect(outcome).toBe("malformed");
  });

  it("ignores payment.authorized without calling finalizeCapturedPayment", async () => {
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const { rawBody, signature } = signedBody({ event: "payment.authorized", payload: { payment: { entity: { id: "p1", order_id: "o1" } } } });
    const outcome = await processRazorpayWebhookDelivery({ rawBody, signature, eventId: "evt_auth" });
    expect(outcome).toBe("ignored");
    expect(finalizeCapturedPaymentMock).not.toHaveBeenCalled();
  });

  it("processes payment.captured by calling finalizeCapturedPayment with the entity's own values", async () => {
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const { rawBody, signature } = signedBody({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 50000, currency: "INR", status: "captured" } } },
    });
    finalizeCapturedPaymentMock.mockResolvedValue({ paymentId: "pay_1", workspaceId: "ws_1", alreadyFinalized: false });

    const outcome = await processRazorpayWebhookDelivery({ rawBody, signature, eventId: "evt_captured_1" });

    expect(outcome).toBe("processed");
    expect(finalizeCapturedPaymentMock).toHaveBeenCalledWith({
      gatewayOrderId: "order_1",
      gatewayPaymentId: "pay_1",
      amountSubunits: BigInt(50000),
      currency: "INR",
    });
  });

  it("processes payment.failed by calling recordPaymentFailure, never finalizeCapturedPayment", async () => {
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const { rawBody, signature } = signedBody({
      event: "payment.failed",
      payload: { payment: { entity: { id: "pay_2", order_id: "order_2", amount: 1000, currency: "INR", status: "failed", error_code: "BAD_CARD", error_description: "declined" } } },
    });

    const outcome = await processRazorpayWebhookDelivery({ rawBody, signature, eventId: "evt_failed_1" });

    expect(outcome).toBe("processed");
    expect(recordPaymentFailureMock).toHaveBeenCalledWith("order_2", "BAD_CARD", "declined");
    expect(finalizeCapturedPaymentMock).not.toHaveBeenCalled();
  });

  it("is idempotent for a duplicate event id that already PROCESSED — never calls finalizeCapturedPayment again", async () => {
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const { rawBody, signature } = signedBody({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_3", order_id: "order_3", amount: 2000, currency: "INR", status: "captured" } } },
    });
    finalizeCapturedPaymentMock.mockResolvedValue({ paymentId: "pay_3", workspaceId: "ws_1", alreadyFinalized: false });

    const first = await processRazorpayWebhookDelivery({ rawBody, signature, eventId: "evt_dup" });
    const second = await processRazorpayWebhookDelivery({ rawBody, signature, eventId: "evt_dup" });

    expect(first).toBe("processed");
    expect(second).toBe("duplicate");
    expect(finalizeCapturedPaymentMock).toHaveBeenCalledTimes(1);
  });

  it("handles out-of-order delivery (failed arrives, then captured for a different payment) independently", async () => {
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const failedBody = signedBody({
      event: "payment.failed",
      payload: { payment: { entity: { id: "pay_4", order_id: "order_4", amount: 100, currency: "INR", status: "failed" } } },
    });
    const capturedBody = signedBody({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_5", order_id: "order_5", amount: 200, currency: "INR", status: "captured" } } },
    });
    finalizeCapturedPaymentMock.mockResolvedValue({ paymentId: "pay_5", workspaceId: "ws_1", alreadyFinalized: false });

    const outcomeCaptured = await processRazorpayWebhookDelivery({ ...capturedBody, eventId: "evt_out_of_order_captured" });
    const outcomeFailed = await processRazorpayWebhookDelivery({ ...failedBody, eventId: "evt_out_of_order_failed" });

    expect(outcomeCaptured).toBe("processed");
    expect(outcomeFailed).toBe("processed");
    expect(finalizeCapturedPaymentMock).toHaveBeenCalledTimes(1);
    expect(recordPaymentFailureMock).toHaveBeenCalledTimes(1);
  });
});
