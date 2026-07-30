import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { s3StorageProvider } from "@/storage/s3-storage-provider";
import { generateReviewToken, hashReviewToken, reviewTokenPrefix } from "@/lib/review-token";
import { generateDownloadToken } from "@/lib/download-token";
import {
  fakePaymentGateway,
  fakeGatewaySimulateCheckout,
  fakeGatewaySetPaymentStatus,
  fakeGatewayBuildWebhookEvent,
  __resetFakeGatewayForTests,
} from "@/payments/fake-payment-gateway";
import { claimNextDeliveryJob, processDeliveryJob } from "@/worker/delivery-job-processor";

/**
 * Integration tests for the full Phase 7 payment -> delivery -> download
 * workflow, against the real test database and real local MinIO. Run via
 * `npm run test:integration`. Uses the deterministic fake payment gateway
 * (PAYMENT_PROVIDER="fake" in .env.test) — never live Razorpay.
 */

const ARJUN_ID = "usr_arjun";

const { requireAuthenticatedUserMock } = vi.hoisted(() => ({ requireAuthenticatedUserMock: vi.fn() }));
vi.mock("@/data-access/auth", () => ({ requireAuthenticatedUser: requireAuthenticatedUserMock }));

function signInAsArjun() {
  requireAuthenticatedUserMock.mockResolvedValue({ id: ARJUN_ID, name: "Arjun Raj", email: "arjun@example.com", role: "CREATOR", image: null });
}

const createdWorkspaceIds: string[] = [];
const createdClientIds: string[] = [];
const createdStorageKeys: string[] = [];

async function createApprovedWorkspaceFixture(opts: {
  title: string;
  amount: string;
  uploadRealObject: boolean;
}) {
  const client = await prisma.client.create({
    data: { creatorId: ARJUN_ID, name: "Test Client", email: `client-${Date.now()}-${Math.random()}@example.com` },
  });
  createdClientIds.push(client.id);

  const workspace = await prisma.workspace.create({
    data: { creatorId: ARJUN_ID, clientId: client.id, title: opts.title, currency: "INR", amount: opts.amount, status: "APPROVED", approvedAt: new Date() },
  });
  createdWorkspaceIds.push(workspace.id);

  const originalStorageKey = `originals/it-payment-${workspace.id}.txt`;
  if (opts.uploadRealObject) {
    await s3StorageProvider.putObjectBuffer(originalStorageKey, Buffer.from(`fixture contents for ${workspace.id}`), "text/plain");
    createdStorageKeys.push(originalStorageKey);
  }

  const file = await prisma.workspaceFile.create({
    data: { workspaceId: workspace.id, displayName: "brief.txt", fileKind: "OTHER", mimeType: "text/plain", sizeBytes: BigInt(32), status: "READY" },
  });
  const version = await prisma.fileVersion.create({
    data: {
      fileId: file.id,
      versionNumber: 1,
      originalStorageKey,
      originalChecksum: "checksum-fixture",
      originalSizeBytes: BigInt(32),
      mimeType: "text/plain",
      status: "READY",
      submittedAt: new Date(),
    },
  });
  await prisma.workspaceFile.update({ where: { id: file.id }, data: { currentVersionId: version.id } });

  const rawToken = generateReviewToken();
  const reviewLink = await prisma.reviewLink.create({
    data: {
      workspaceId: workspace.id,
      tokenHash: hashReviewToken(rawToken),
      tokenPrefix: reviewTokenPrefix(rawToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdById: ARJUN_ID,
    },
  });

  const approval = await prisma.workspaceApproval.create({
    data: {
      workspaceId: workspace.id,
      reviewLinkId: reviewLink.id,
      approvedFileVersionSnapshot: [{ workspaceFileId: file.id, fileVersionId: version.id, displayName: file.displayName, versionNumber: 1 }],
      // Mirrors what the real approveWorkspace() flow freezes at approval
      // time (Phase 7.5 security-gate fix) — payment-order creation reads
      // amount from here, never live Workspace.amount.
      approvedAmount: opts.amount,
      approvedCurrency: "INR",
      reviewerName: "Test Reviewer",
      status: "APPROVED",
      termsAccepted: true,
    },
  });

  return { workspace, client, file, version, reviewLink, approval, reviewToken: rawToken };
}

beforeAll(async () => {
  const probe = await s3StorageProvider.headObject("temp/__payment_integration_probe__");
  expect(probe).toBeNull();
});

afterAll(async () => {
  await Promise.allSettled(createdStorageKeys.map((key) => s3StorageProvider.deleteObject(key)));
  const bundles = await prisma.deliveryBundle.findMany({ where: { workspaceId: { in: createdWorkspaceIds } }, select: { storageKey: true } });
  await Promise.allSettled(bundles.filter((b) => b.storageKey).map((b) => s3StorageProvider.deleteObject(b.storageKey!)));

  await prisma.downloadLog.deleteMany({ where: { grant: { workspaceId: { in: createdWorkspaceIds } } } });
  await prisma.downloadGrantFile.deleteMany({ where: { grant: { workspaceId: { in: createdWorkspaceIds } } } });
  await prisma.downloadGrant.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.deliveryBundleJob.deleteMany({ where: { deliveryBundle: { workspaceId: { in: createdWorkspaceIds } } } });
  await prisma.deliveryBundle.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.webhookEvent.deleteMany({});
  await prisma.payment.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.workspaceApproval.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.reviewLink.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.fileVersion.deleteMany({ where: { file: { workspaceId: { in: createdWorkspaceIds } } } });
  await prisma.workspaceFile.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
  await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
  await prisma.rateLimitAttempt.deleteMany({});
  await prisma.$disconnect();
});

describe("payment order creation", () => {
  it("an approved workspace creates a payment order with the database's own amount", async () => {
    __resetFakeGatewayForTests();
    const { authorizeReviewToken } = await import("./review-auth");
    const { createPaymentOrder } = await import("./payment-orders");

    const fixture = await createApprovedWorkspaceFixture({ title: "Order Creation Fixture", amount: "500.00", uploadRealObject: true });
    const context = await authorizeReviewToken(fixture.reviewToken);

    const checkout = await createPaymentOrder(context);

    expect(checkout.amount).toBe(500);
    expect(checkout.currency).toBe("INR");
    expect(checkout.amountSubunits).toBe("50000");
    expect(JSON.stringify(checkout)).not.toMatch(/keySecret|webhookSecret|storageKey/i);

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(workspace.status).toBe("PAYMENT_PENDING");
  });

  it("a duplicate order request reuses the existing active order rather than creating a second one", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    const { createPaymentOrder } = await import("./payment-orders");

    const fixture = await createApprovedWorkspaceFixture({ title: "Duplicate Order Fixture", amount: "250.00", uploadRealObject: false });
    const context = await authorizeReviewToken(fixture.reviewToken);

    const first = await createPaymentOrder(context);
    const second = await createPaymentOrder(context);

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.orderId).toBe(first.orderId);

    const count = await prisma.payment.count({ where: { workspaceId: fixture.workspace.id } });
    expect(count).toBe(1);
  });

  it("an ineligible (non-APPROVED) workspace cannot create an order", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    const { createPaymentOrder, WorkspaceNotApprovedError } = await import("./payment-orders");

    const fixture = await createApprovedWorkspaceFixture({ title: "Ineligible Fixture", amount: "100.00", uploadRealObject: false });
    await prisma.workspace.update({ where: { id: fixture.workspace.id }, data: { status: "IN_REVIEW" } });
    const context = await authorizeReviewToken(fixture.reviewToken);

    await expect(createPaymentOrder(context)).rejects.toBeInstanceOf(WorkspaceNotApprovedError);
  });
});

describe("checkout signature verification", () => {
  it("a valid Checkout signature is recorded and does not unlock files", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    const { createPaymentOrder } = await import("./payment-orders");
    const { verifyCheckoutCallback } = await import("./payment-verification");

    const fixture = await createApprovedWorkspaceFixture({ title: "Verify Fixture", amount: "300.00", uploadRealObject: false });
    const context = await authorizeReviewToken(fixture.reviewToken);
    const checkout = await createPaymentOrder(context);
    const { paymentId, signature } = fakeGatewaySimulateCheckout(checkout.orderId);

    const result = await verifyCheckoutCallback(context, { orderId: checkout.orderId, paymentId, signature });
    expect(result.verified).toBe(true);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(payment.status).toBe("PENDING");
    expect(payment.gatewaySignatureVerifiedAt).not.toBeNull();

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(workspace.status).toBe("PAYMENT_PENDING"); // NOT PAID — checkout callback alone never unlocks anything
  });

  it("an invalid Checkout signature is rejected and never touches workspace/payment state", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    const { createPaymentOrder } = await import("./payment-orders");
    const { verifyCheckoutCallback } = await import("./payment-verification");
    const { InvalidSignatureError } = await import("@/payments/payment-errors");

    const fixture = await createApprovedWorkspaceFixture({ title: "Invalid Signature Fixture", amount: "300.00", uploadRealObject: false });
    const context = await authorizeReviewToken(fixture.reviewToken);
    const checkout = await createPaymentOrder(context);
    const { paymentId } = fakeGatewaySimulateCheckout(checkout.orderId);

    await expect(
      verifyCheckoutCallback(context, { orderId: checkout.orderId, paymentId, signature: "forged-signature" }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(payment.status).toBe("CREATED");
    expect(payment.gatewaySignatureVerifiedAt).toBeNull();
  });
});

describe("webhook capture -> finalization -> delivery -> download (full happy path)", () => {
  it("runs the entire flow end to end exactly once", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    const { createPaymentOrder } = await import("./payment-orders");
    const { verifyCheckoutCallback } = await import("./payment-verification");
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const { authorizeDownloadGrant } = await import("./download-auth");
    const { downloadOriginalFile, downloadBundle } = await import("./downloads");

    const fixture = await createApprovedWorkspaceFixture({ title: "Happy Path Fixture", amount: "750.00", uploadRealObject: true });
    const context = await authorizeReviewToken(fixture.reviewToken);
    const checkout = await createPaymentOrder(context);
    const { paymentId, signature } = fakeGatewaySimulateCheckout(checkout.orderId);
    await verifyCheckoutCallback(context, { orderId: checkout.orderId, paymentId, signature });

    const capturedPayment = fakeGatewaySetPaymentStatus(paymentId, "captured");

    // payment.authorized must never mark PAID.
    const authorizedEvent = fakeGatewayBuildWebhookEvent("payment.authorized", { ...capturedPayment, status: "authorized" }, {
      eventId: "evt_happy_authorized",
    });
    const authorizedOutcome = await processRazorpayWebhookDelivery(authorizedEvent);
    expect(authorizedOutcome).toBe("ignored");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } })).status).toBe("PENDING");

    // payment.captured — the real unlock trigger.
    const capturedEvent = fakeGatewayBuildWebhookEvent("payment.captured", capturedPayment, { eventId: "evt_happy_captured" });
    const outcome = await processRazorpayWebhookDelivery(capturedEvent);
    expect(outcome).toBe("processed");

    const paidPayment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(paidPayment.status).toBe("PAID");
    const paidWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(paidWorkspace.status).toBe("PAID");

    let bundleCount = await prisma.deliveryBundle.count({ where: { paymentId: checkout.paymentId } });
    expect(bundleCount).toBe(1);
    const jobCount = await prisma.deliveryBundleJob.count({ where: { deliveryBundle: { paymentId: checkout.paymentId } } });
    expect(jobCount).toBe(1);

    // Duplicate webhook delivery — must not create a second bundle/job or re-increment anything.
    const duplicateOutcome = await processRazorpayWebhookDelivery(capturedEvent);
    expect(duplicateOutcome).toBe("duplicate");
    bundleCount = await prisma.deliveryBundle.count({ where: { paymentId: checkout.paymentId } });
    expect(bundleCount).toBe(1);

    // Run the real delivery worker on the real job.
    const job = await claimNextDeliveryJob(prisma);
    expect(job).not.toBeNull();
    expect(job!.deliveryBundle.paymentId).toBe(checkout.paymentId);
    await processDeliveryJob(prisma, job!);

    const bundle = await prisma.deliveryBundle.findUniqueOrThrow({ where: { paymentId: checkout.paymentId } });
    expect(bundle.status).toBe("READY");
    expect(bundle.checksum).toBeTruthy();
    expect(bundle.storageKey).toBeTruthy();
    createdStorageKeys.push(bundle.storageKey!);

    const unlockedWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(unlockedWorkspace.status).toBe("FILES_UNLOCKED");

    const grant = await prisma.downloadGrant.findUniqueOrThrow({ where: { paymentId: checkout.paymentId } });
    expect(grant.tokenHash).toBeTruthy();

    // No raw download token is ever persisted — a client claims a fresh
    // single-use session from inside their token-authorized review portal.
    const { claimDownloadSession } = await import("./downloads");
    const { authorizeReviewToken: authorizeReviewTokenForClaim } = await import("./review-auth");
    const claimContext = await authorizeReviewTokenForClaim(fixture.reviewToken);
    const downloadPath = await claimDownloadSession(claimContext);
    const rawDownloadToken = downloadPath.replace("/download/", "");
    expect(rawDownloadToken).toBeTruthy();

    // A review token must never work as a download token — different token space entirely.
    const { InvalidDownloadTokenError } = await import("./download-auth");
    await expect(authorizeDownloadGrant(fixture.reviewToken)).rejects.toBeInstanceOf(InvalidDownloadTokenError);

    const downloadContext = await authorizeDownloadGrant(rawDownloadToken);
    expect(JSON.stringify(downloadContext)).not.toMatch(/storageKey|tokenHash/i);

    // Cross-workspace file access fails.
    const { FileNotInGrantError } = await import("./downloads");
    await expect(downloadOriginalFile(downloadContext, "not-a-real-file-id", { userAgent: null, ip: null })).rejects.toBeInstanceOf(
      FileNotInGrantError,
    );

    // Individual original download — first exercise of secure delivery access -> DELIVERED.
    const individualResult = await downloadOriginalFile(downloadContext, fixture.file.id, { userAgent: "vitest", ip: "127.0.0.1" });
    expect(individualResult.url).toContain("http");

    const deliveredWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(deliveredWorkspace.status).toBe("DELIVERED");

    const logsAfterIndividual = await prisma.downloadLog.count({ where: { grantId: grant.id } });
    expect(logsAfterIndividual).toBe(1);

    // Download All (bundle) — a second, independent successful download.
    const refreshedContext = await authorizeDownloadGrant(rawDownloadToken);
    const bundleResult = await downloadBundle(refreshedContext, { userAgent: "vitest", ip: "127.0.0.1" });
    expect(bundleResult.url).toContain("http");

    const logsAfterBundle = await prisma.downloadLog.count({ where: { grantId: grant.id } });
    expect(logsAfterBundle).toBe(2);

    const finalGrant = await prisma.downloadGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(finalGrant.downloadCount).toBe(2);

    // Platform-fee breakdown was frozen at order-creation time (₹750 * 2% = ₹15 fee, ₹735 payable).
    const breakdown = await prisma.paymentBreakdown.findUniqueOrThrow({ where: { paymentId: checkout.paymentId } });
    expect(breakdown.platformFeeBps).toBe(200);
    expect(breakdown.platformFeeSubunits).toBe(BigInt(1500));
    expect(breakdown.freelancerPayableSubunits).toBe(BigInt(73500));

    // Capture created exactly one PAYMENT_CREDIT + one PLATFORM_FEE ledger entry, and the creator's balance reflects it.
    const creditEntry = await prisma.payoutLedgerEntry.findFirstOrThrow({
      where: { paymentId: checkout.paymentId, type: "PAYMENT_CREDIT" },
    });
    expect(creditEntry.amountSubunits).toBe(BigInt(73500));
    expect(creditEntry.status).toBe("PENDING");
    const feeEntryCount = await prisma.payoutLedgerEntry.count({ where: { paymentId: checkout.paymentId, type: "PLATFORM_FEE" } });
    expect(feeEntryCount).toBe(1);

    const balance = await prisma.creatorBalanceAccount.findUniqueOrThrow({ where: { creatorId: ARJUN_ID } });
    expect(balance.pendingSubunits).toBeGreaterThanOrEqual(BigInt(73500));

    // Test-mode payout simulation: PENDING -> AVAILABLE -> PROCESSING -> PAID, using the real fake provider (not the payment gateway).
    const { getPayoutProvider } = await import("@/payouts/payout-provider");
    const payoutProvider = await getPayoutProvider();
    await payoutProvider.markAvailable(creditEntry.id);
    let updatedEntry = await prisma.payoutLedgerEntry.findUniqueOrThrow({ where: { id: creditEntry.id } });
    expect(updatedEntry.status).toBe("AVAILABLE");

    await payoutProvider.startPayout(creditEntry.id);
    updatedEntry = await prisma.payoutLedgerEntry.findUniqueOrThrow({ where: { id: creditEntry.id } });
    expect(updatedEntry.status).toBe("PROCESSING");

    // Repeating the same step is idempotent — no double balance movement.
    await payoutProvider.completePayout(creditEntry.id);
    await payoutProvider.completePayout(creditEntry.id);
    updatedEntry = await prisma.payoutLedgerEntry.findUniqueOrThrow({ where: { id: creditEntry.id } });
    expect(updatedEntry.status).toBe("PAID");

    const finalBalance = await prisma.creatorBalanceAccount.findUniqueOrThrow({ where: { creatorId: ARJUN_ID } });
    expect(finalBalance.paidOutSubunits).toBeGreaterThanOrEqual(BigInt(73500));

    // Payment/download state is completely unaffected by the payout simulation.
    const paymentAfterPayout = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(paymentAfterPayout.status).toBe("PAID");
  });
});

describe("delivery-bundle worker failure and retry", () => {
  it("a failed delivery leaves the workspace PAID (never FILES_UNLOCKED) and preserves payment truth", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    const { createPaymentOrder } = await import("./payment-orders");
    const { verifyCheckoutCallback } = await import("./payment-verification");
    const { finalizeCapturedPayment } = await import("./payment-finalization");

    // No real object uploaded to MinIO — the worker's getObjectBuffer call will fail.
    const fixture = await createApprovedWorkspaceFixture({ title: "Failed Delivery Fixture", amount: "400.00", uploadRealObject: false });
    const context = await authorizeReviewToken(fixture.reviewToken);
    const checkout = await createPaymentOrder(context);
    const { paymentId, signature } = fakeGatewaySimulateCheckout(checkout.orderId);
    await verifyCheckoutCallback(context, { orderId: checkout.orderId, paymentId, signature });
    fakeGatewaySetPaymentStatus(paymentId, "captured");

    await finalizeCapturedPayment({
      gatewayOrderId: checkout.orderId,
      gatewayPaymentId: paymentId,
      amountSubunits: BigInt(checkout.amountSubunits),
      currency: checkout.currency,
    });

    const job = await claimNextDeliveryJob(prisma);
    expect(job).not.toBeNull();
    await processDeliveryJob(prisma, job!);

    const bundle = await prisma.deliveryBundle.findUniqueOrThrow({ where: { paymentId: checkout.paymentId } });
    expect(bundle.status).toBe("FAILED");

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(workspace.status).toBe("PAID"); // never FILES_UNLOCKED, never re-asks for payment

    const paidPayment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(paidPayment.status).toBe("PAID"); // payment truth preserved

    // Creator-triggered retry creates exactly one new job row.
    signInAsArjun();
    const { retryDeliveryPreparation } = await import("./delivery-retry");
    await retryDeliveryPreparation(fixture.workspace.id, checkout.paymentId);

    const jobsAfterRetry = await prisma.deliveryBundleJob.count({ where: { deliveryBundleId: bundle.id } });
    expect(jobsAfterRetry).toBe(2);
    const bundleAfterRetry = await prisma.deliveryBundle.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(bundleAfterRetry.status).toBe("PENDING");
  });
});

describe("reconciliation fallback", () => {
  it("finalizes a captured payment via reconciliation when no webhook has arrived", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    const { createPaymentOrder } = await import("./payment-orders");
    const { verifyCheckoutCallback } = await import("./payment-verification");
    const { reconcilePaymentStatus } = await import("./payment-reconciliation");

    const fixture = await createApprovedWorkspaceFixture({ title: "Reconciliation Fixture", amount: "600.00", uploadRealObject: true });
    const context = await authorizeReviewToken(fixture.reviewToken);
    const checkout = await createPaymentOrder(context);
    const { paymentId, signature } = fakeGatewaySimulateCheckout(checkout.orderId);
    await verifyCheckoutCallback(context, { orderId: checkout.orderId, paymentId, signature });
    fakeGatewaySetPaymentStatus(paymentId, "captured");

    // No webhook delivered — the client/creator triggers reconciliation instead.
    const result = await reconcilePaymentStatus(checkout.paymentId);
    expect(result.status).toBe("PAID");

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(payment.status).toBe("PAID");

    const bundleCount = await prisma.deliveryBundle.count({ where: { paymentId: checkout.paymentId } });
    expect(bundleCount).toBe(1); // finalization is idempotent/shared — not duplicated by later webhook arrival

    // A late-arriving webhook for the same payment must not duplicate anything.
    const { processRazorpayWebhookDelivery } = await import("./webhook-processing");
    const capturedPayment = await fakePaymentGateway.fetchPayment(paymentId);
    const lateEvent = fakeGatewayBuildWebhookEvent("payment.captured", capturedPayment, { eventId: "evt_late_after_reconcile" });
    await processRazorpayWebhookDelivery(lateEvent);

    const bundleCountAfterLateWebhook = await prisma.deliveryBundle.count({ where: { paymentId: checkout.paymentId } });
    expect(bundleCountAfterLateWebhook).toBe(1);
  });
});

describe("amount and currency mismatch rejection", () => {
  it("rejects finalization on an amount mismatch and leaves the workspace PAYMENT_PENDING", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    const { createPaymentOrder } = await import("./payment-orders");
    const { verifyCheckoutCallback } = await import("./payment-verification");
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    const { AmountMismatchError } = await import("@/payments/payment-errors");

    const fixture = await createApprovedWorkspaceFixture({ title: "Amount Mismatch Fixture", amount: "1000.00", uploadRealObject: false });
    const context = await authorizeReviewToken(fixture.reviewToken);
    const checkout = await createPaymentOrder(context);
    const { paymentId, signature } = fakeGatewaySimulateCheckout(checkout.orderId);
    await verifyCheckoutCallback(context, { orderId: checkout.orderId, paymentId, signature });
    fakeGatewaySetPaymentStatus(paymentId, "captured");

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: checkout.orderId, gatewayPaymentId: paymentId, amountSubunits: BigInt(1), currency: "INR" }),
    ).rejects.toBeInstanceOf(AmountMismatchError);

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(workspace.status).toBe("PAYMENT_PENDING");
    const bundleCount = await prisma.deliveryBundle.count({ where: { paymentId: checkout.paymentId } });
    expect(bundleCount).toBe(0);
  });

  it("rejects an unknown gateway order safely, without creating anything", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    const { UnknownOrderError } = await import("@/payments/payment-errors");

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: "order_never_created", gatewayPaymentId: "pay_x", amountSubunits: BigInt(100), currency: "INR" }),
    ).rejects.toBeInstanceOf(UnknownOrderError);
  });
});

describe("download-grant expiry and exhaustion", () => {
  it("an expired grant fails authorization even though the fixture is otherwise valid", async () => {
    const fixture = await createApprovedWorkspaceFixture({ title: "Expired Grant Fixture", amount: "200.00", uploadRealObject: false });
    const payment = await prisma.payment.create({
      data: {
        workspaceId: fixture.workspace.id,
        approvalId: fixture.approval.id,
        amount: "200.00",
        amountSubunits: BigInt(20000),
        currency: "INR",
        status: "PAID",
        attemptNumber: 1,
        idempotencyKey: `it-${fixture.workspace.id}-expired`,
      },
    });
    const rawToken = generateDownloadToken();
    const { hashDownloadToken, downloadTokenPrefix } = await import("@/lib/download-token");
    await prisma.downloadGrant.create({
      data: {
        workspaceId: fixture.workspace.id,
        paymentId: payment.id,
        approvalId: fixture.approval.id,
        tokenHash: hashDownloadToken(rawToken),
        tokenPrefix: downloadTokenPrefix(rawToken),
        expiresAt: new Date(Date.now() - 1000),
        maxDownloads: 5,
      },
    });

    const { authorizeDownloadGrant, DownloadGrantExpiredError } = await import("./download-auth");
    await expect(authorizeDownloadGrant(rawToken)).rejects.toBeInstanceOf(DownloadGrantExpiredError);
  });

  it("an exhausted grant fails authorization once downloadCount reaches maxDownloads", async () => {
    const fixture = await createApprovedWorkspaceFixture({ title: "Exhausted Grant Fixture", amount: "200.00", uploadRealObject: false });
    const payment = await prisma.payment.create({
      data: {
        workspaceId: fixture.workspace.id,
        approvalId: fixture.approval.id,
        amount: "200.00",
        amountSubunits: BigInt(20000),
        currency: "INR",
        status: "PAID",
        attemptNumber: 1,
        idempotencyKey: `it-${fixture.workspace.id}-exhausted`,
      },
    });
    const rawToken = generateDownloadToken();
    const { hashDownloadToken, downloadTokenPrefix } = await import("@/lib/download-token");
    await prisma.downloadGrant.create({
      data: {
        workspaceId: fixture.workspace.id,
        paymentId: payment.id,
        approvalId: fixture.approval.id,
        tokenHash: hashDownloadToken(rawToken),
        tokenPrefix: downloadTokenPrefix(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
        maxDownloads: 1,
        downloadCount: 1,
      },
    });

    const { authorizeDownloadGrant, DownloadGrantExhaustedError } = await import("./download-auth");
    await expect(authorizeDownloadGrant(rawToken)).rejects.toBeInstanceOf(DownloadGrantExhaustedError);
  });
});
