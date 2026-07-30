import { describe, expect, it, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetCreatorData, seedArjun } from "../../prisma/seed";

/**
 * Proves prisma/seed.ts's resetCreatorData() stays safe to re-run even
 * after a real (non-decorative) upload/download/delivery/support flow has
 * created rows against a seeded workspace — exactly what happens after
 * running the Playwright E2E/visual suites against a freshly-seeded dev
 * database. Before this test's fix, DownloadGrantFile/DownloadGrant/
 * DeliveryBundle/Payment each hold an onDelete: Restrict foreign key into
 * WorkspaceFile/FileVersion/WorkspaceApproval (see schema.prisma), and a
 * plain `workspace.deleteMany()` could fail with a foreign-key violation
 * once any of those rows existed.
 *
 * Restores Arjun's standard seeded shape (fixed ids, same field values)
 * in `afterAll` regardless of pass/fail, since other integration test
 * files in this same suite run (see vitest.integration.config.ts's
 * `fileParallelism: false`) depend on his fixed workspace/payment ids
 * (e.g. `ws_product_pkg`, `pay_101`).
 */

const ARJUN_ID = "usr_arjun";
const POLLUTED_WORKSPACE_ID = "ws_product_pkg";
const POLLUTED_PAYMENT_ID = "pay_101";
const POLLUTED_APPROVAL_ID = "appr_product_pkg";

afterAll(async () => {
  // Always leave Arjun back in his standard, fully-seeded shape — later
  // integration test files in this run depend on his fixed ids.
  await seedArjun();
});

describe("prisma/seed.ts resetCreatorData — idempotency after real (non-decorative) data", () => {
  it("re-seeds cleanly after E2E-style uploads, comments, pins/annotations, a download grant, a delivery bundle, a payout ledger entry, and a support ticket", async () => {
    await seedArjun();

    // --- Simulate what real upload/review/payment/delivery/support flows
    // leave behind against an already-seeded, already-paid workspace ---
    const file = await prisma.workspaceFile.create({
      data: {
        workspaceId: POLLUTED_WORKSPACE_ID,
        displayName: "pollution-fixture.jpg",
        fileKind: "IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: BigInt(1024),
        status: "READY",
      },
    });
    const version = await prisma.fileVersion.create({
      data: {
        fileId: file.id,
        versionNumber: 1,
        originalStorageKey: `originals/it-seed-idempotency-${file.id}.jpg`,
        originalChecksum: "checksum-fixture",
        originalSizeBytes: BigInt(1024),
        mimeType: "image/jpeg",
        status: "READY",
        submittedAt: new Date(),
      },
    });
    await prisma.workspaceFile.update({ where: { id: file.id }, data: { currentVersionId: version.id } });

    const comment = await prisma.reviewComment.create({
      data: {
        workspaceId: POLLUTED_WORKSPACE_ID,
        workspaceFileId: file.id,
        fileVersionId: version.id,
        authorType: "CLIENT",
        reviewerName: "Pollution Client",
        reviewerEmail: "pollution@example.com",
        body: "Fixture comment for the reset-idempotency test.",
        status: "OPEN",
        pinX: 0.5,
        pinY: 0.5,
        pinNumber: 1,
      },
    });
    await prisma.reviewAnnotation.create({
      data: {
        commentId: comment.id,
        workspaceId: POLLUTED_WORKSPACE_ID,
        workspaceFileId: file.id,
        fileVersionId: version.id,
        type: "CIRCLE",
        geometry: { cx: 0.5, cy: 0.5, r: 0.05 },
      },
    });

    const grant = await prisma.downloadGrant.create({
      data: {
        workspaceId: POLLUTED_WORKSPACE_ID,
        paymentId: null,
        approvalId: POLLUTED_APPROVAL_ID,
        tokenHash: "it-seed-idempotency-grant-hash",
        tokenPrefix: "itseed01",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        maxDownloads: 5,
      },
    });
    await prisma.downloadGrantFile.create({
      data: {
        grantId: grant.id,
        workspaceFileId: file.id,
        fileVersionId: version.id,
        displayName: file.displayName,
        sizeBytes: version.originalSizeBytes,
      },
    });

    await prisma.deliveryBundle.create({
      data: {
        workspaceId: POLLUTED_WORKSPACE_ID,
        paymentId: null,
        approvalId: POLLUTED_APPROVAL_ID,
        status: "READY",
        storageKey: `deliveries/it-seed-idempotency-${POLLUTED_WORKSPACE_ID}.zip`,
        checksum: "checksum-fixture",
        sizeBytes: BigInt(2048),
      },
    });

    await prisma.payoutLedgerEntry.create({
      data: {
        creatorId: ARJUN_ID,
        paymentId: POLLUTED_PAYMENT_ID,
        type: "PAYMENT_CREDIT",
        amountSubunits: BigInt(1_000_00),
        currency: "INR",
        status: "AVAILABLE",
      },
    });

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber: `TCK-ITSEED-${Date.now()}`,
        workspaceId: POLLUTED_WORKSPACE_ID,
        creatorId: ARJUN_ID,
        category: "DELIVERY",
        status: "OPEN",
        priority: "normal",
        subject: "Pollution fixture ticket",
        description: "Fixture support ticket for the reset-idempotency test.",
        createdByType: "CLIENT",
        reviewerName: "Pollution Client",
        reviewerEmail: "pollution@example.com",
      },
    });
    await prisma.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorType: "CREATOR",
        creatorAuthorId: ARJUN_ID,
        body: "Fixture reply.",
      },
    });

    // --- The actual thing under test: resetting Arjun's data must not
    // throw a foreign-key violation now that all of the above exists. ---
    await expect(resetCreatorData(ARJUN_ID)).resolves.not.toThrow();

    // The polluted workspace (and everything under it) is gone.
    const workspaceAfterReset = await prisma.workspace.findUnique({ where: { id: POLLUTED_WORKSPACE_ID } });
    expect(workspaceAfterReset).toBeNull();
    const ticketAfterReset = await prisma.supportTicket.findUnique({ where: { id: ticket.id } });
    expect(ticketAfterReset).toBeNull();

    // Running the full seed again afterward reconverges to the standard
    // shape without error — proving the reset didn't leave anything in a
    // state that blocks a subsequent normal seed run.
    await expect(seedArjun()).resolves.not.toThrow();
    const restoredWorkspace = await prisma.workspace.findUnique({ where: { id: POLLUTED_WORKSPACE_ID } });
    expect(restoredWorkspace).not.toBeNull();
    expect(restoredWorkspace?.title).toBe("Product Packaging Design");

    // Re-running the reset + reseed a second time is still a no-op-shaped
    // success (true idempotency), not something that only works once.
    await expect(resetCreatorData(ARJUN_ID)).resolves.not.toThrow();
    await expect(seedArjun()).resolves.not.toThrow();
    const restoredAgain = await prisma.workspace.findUnique({ where: { id: POLLUTED_WORKSPACE_ID } });
    expect(restoredAgain).not.toBeNull();
  });
});
