import { describe, expect, it, vi, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { s3StorageProvider } from "@/storage/s3-storage-provider";
import { generateReviewToken, hashReviewToken, reviewTokenPrefix } from "@/lib/review-token";
import { claimNextDeliveryJob, processDeliveryJob } from "@/worker/delivery-job-processor";

/**
 * Integration tests (real database, real local MinIO) for the
 * APPROVAL_ONLY and PREVIEW_ONLY delivery-mode workflows — see
 * DELIVERY_MODES.md. The PAYMENT_REQUIRED equivalent (payment ->
 * finalize -> deliver -> download) lives in
 * payment-workflow.integration.test.ts; this file exercises the two modes
 * that never touch payment code at all.
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

afterAll(async () => {
  await prisma.downloadLog.deleteMany({ where: { grant: { workspaceId: { in: createdWorkspaceIds } } } });
  await prisma.downloadGrantFile.deleteMany({ where: { grant: { workspaceId: { in: createdWorkspaceIds } } } });
  await prisma.downloadGrant.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.deliveryBundleJob.deleteMany({ where: { deliveryBundle: { workspaceId: { in: createdWorkspaceIds } } } });
  await prisma.deliveryBundle.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.workspaceApproval.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.reviewLink.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.fileVersion.deleteMany({ where: { file: { workspaceId: { in: createdWorkspaceIds } } } });
  await prisma.workspaceFile.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.activityLog.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
  await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
  for (const key of createdStorageKeys) {
    await s3StorageProvider.deleteObject(key).catch(() => {});
  }
  await prisma.$disconnect();
});

async function createInReviewWorkspaceFixture(opts: { title: string; deliveryMode: "APPROVAL_ONLY" | "PREVIEW_ONLY" }) {
  const client = await prisma.client.create({
    data: { creatorId: ARJUN_ID, name: "Test Client", email: `client-${Date.now()}-${Math.random()}@example.com` },
  });
  createdClientIds.push(client.id);

  const workspace = await prisma.workspace.create({
    data: {
      creatorId: ARJUN_ID,
      clientId: client.id,
      clientName: client.name,
      title: opts.title,
      currency: "INR",
      amount: null,
      deliveryMode: opts.deliveryMode,
      status: "IN_REVIEW",
    },
  });
  createdWorkspaceIds.push(workspace.id);

  const originalStorageKey = `originals/it-delivery-mode-${workspace.id}.txt`;
  await s3StorageProvider.putObjectBuffer(originalStorageKey, Buffer.from(`fixture contents for ${workspace.id}`), "text/plain");
  createdStorageKeys.push(originalStorageKey);

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

  return { workspace, client, file, version, reviewLink, reviewToken: rawToken };
}

describe("APPROVAL_ONLY delivery mode", () => {
  it("approve -> AWAITING_CREATOR_RELEASE -> creator release -> worker -> FILES_UNLOCKED -> download, with no Payment ever created", async () => {
    const fixture = await createInReviewWorkspaceFixture({ title: "IT Approval-Only Workspace", deliveryMode: "APPROVAL_ONLY" });

    const { authorizeReviewToken } = await import("./review-auth");
    const context = await authorizeReviewToken(fixture.reviewToken);
    const { approveWorkspace } = await import("./approvals");
    await approveWorkspace(context, { reviewerName: "Test Reviewer", termsAccepted: true });

    const approvedWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(approvedWorkspace.status).toBe("AWAITING_CREATOR_RELEASE");

    const paymentCount = await prisma.payment.count({ where: { workspaceId: fixture.workspace.id } });
    expect(paymentCount).toBe(0);

    signInAsArjun();
    const { releaseApprovedFiles } = await import("./delivery-release");
    await releaseApprovedFiles(fixture.workspace.id);

    const bundleCount = await prisma.deliveryBundle.count({ where: { workspaceId: fixture.workspace.id } });
    expect(bundleCount).toBe(1);
    const bundle = await prisma.deliveryBundle.findFirstOrThrow({ where: { workspaceId: fixture.workspace.id } });
    expect(bundle.paymentId).toBeNull();

    // Idempotent — a second release call must not create a second bundle.
    await releaseApprovedFiles(fixture.workspace.id);
    expect(await prisma.deliveryBundle.count({ where: { workspaceId: fixture.workspace.id } })).toBe(1);

    const job = await claimNextDeliveryJob(prisma);
    expect(job).not.toBeNull();
    expect(job!.deliveryBundle.workspaceId).toBe(fixture.workspace.id);
    await processDeliveryJob(prisma, job!);

    const unlockedWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(unlockedWorkspace.status).toBe("FILES_UNLOCKED");

    const grant = await prisma.downloadGrant.findFirstOrThrow({ where: { workspaceId: fixture.workspace.id } });
    expect(grant.paymentId).toBeNull();

    const { claimDownloadSession } = await import("./downloads");
    const claimContext = await authorizeReviewToken(fixture.reviewToken);
    const downloadPath = await claimDownloadSession(claimContext);
    const rawDownloadToken = downloadPath.replace("/download/", "");

    const { authorizeDownloadGrant } = await import("./download-auth");
    const downloadContext = await authorizeDownloadGrant(rawDownloadToken);
    expect(downloadContext.paymentId).toBeNull();
    expect(downloadContext.paymentReference).toBeNull();

    const { downloadOriginalFile } = await import("./downloads");
    const result = await downloadOriginalFile(downloadContext, fixture.file.id, { userAgent: "vitest", ip: "127.0.0.1" });
    expect(result.url).toContain("http");

    const deliveredWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(deliveredWorkspace.status).toBe("DELIVERED");
  });

  it("refuses release for a workspace not yet AWAITING_CREATOR_RELEASE", async () => {
    const fixture = await createInReviewWorkspaceFixture({ title: "IT Approval-Only Not Yet Approved", deliveryMode: "APPROVAL_ONLY" });
    signInAsArjun();
    const { releaseApprovedFiles, WorkspaceNotReleasableError } = await import("./delivery-release");
    await expect(releaseApprovedFiles(fixture.workspace.id)).rejects.toBeInstanceOf(WorkspaceNotReleasableError);
  });

  it("the creator UI's canReleaseFiles guard flips off as soon as a DeliveryBundle exists, independent of the worker having run yet", async () => {
    const fixture = await createInReviewWorkspaceFixture({ title: "IT Approval-Only Release Guard", deliveryMode: "APPROVAL_ONLY" });

    const { authorizeReviewToken } = await import("./review-auth");
    const context = await authorizeReviewToken(fixture.reviewToken);
    const { approveWorkspace } = await import("./approvals");
    await approveWorkspace(context, { reviewerName: "Test Reviewer", termsAccepted: true });

    signInAsArjun();
    const { getOwnedWorkspaceDetail } = await import("./workspaces");
    const beforeRelease = await getOwnedWorkspaceDetail(fixture.workspace.id);
    expect(beforeRelease?.canReleaseFiles).toBe(true);

    const { releaseApprovedFiles } = await import("./delivery-release");
    await releaseApprovedFiles(fixture.workspace.id);

    // Status is still AWAITING_CREATOR_RELEASE at this point (the worker
    // hasn't claimed the job yet) — canReleaseFiles must already be false
    // purely because a DeliveryBundle now exists, so the button can never
    // be double-clicked into a second release while preparation is in
    // flight.
    const stillAwaiting = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(stillAwaiting.status).toBe("AWAITING_CREATOR_RELEASE");
    const afterRelease = await getOwnedWorkspaceDetail(fixture.workspace.id);
    expect(afterRelease?.canReleaseFiles).toBe(false);

    // Drain this workspace's own delivery job so it can't be claimed by a
    // later test's claimNextDeliveryJob() call (the queue is a shared,
    // FIFO, cross-workspace table within this file).
    const job = await claimNextDeliveryJob(prisma);
    expect(job!.deliveryBundle.workspaceId).toBe(fixture.workspace.id);
    await processDeliveryJob(prisma, job!);
  });

  it("gates both individual-file and bundle downloads identically: blocked before FILES_UNLOCKED, both succeed only after", async () => {
    const fixture = await createInReviewWorkspaceFixture({ title: "IT Approval-Only Download Gating", deliveryMode: "APPROVAL_ONLY" });

    const { authorizeReviewToken } = await import("./review-auth");
    const { claimDownloadSession, DownloadNotReadyError } = await import("./downloads");
    const preApprovalContext = await authorizeReviewToken(fixture.reviewToken);
    await expect(claimDownloadSession(preApprovalContext)).rejects.toBeInstanceOf(DownloadNotReadyError);

    const { approveWorkspace } = await import("./approvals");
    const approveContext = await authorizeReviewToken(fixture.reviewToken);
    await approveWorkspace(approveContext, { reviewerName: "Test Reviewer", termsAccepted: true });

    const postApprovalContext = await authorizeReviewToken(fixture.reviewToken);
    await expect(claimDownloadSession(postApprovalContext)).rejects.toBeInstanceOf(DownloadNotReadyError);

    signInAsArjun();
    const { releaseApprovedFiles } = await import("./delivery-release");
    await releaseApprovedFiles(fixture.workspace.id);
    const job = await claimNextDeliveryJob(prisma);
    await processDeliveryJob(prisma, job!);

    const unlockedWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(unlockedWorkspace.status).toBe("FILES_UNLOCKED");

    const claimContext = await authorizeReviewToken(fixture.reviewToken);
    const downloadPath = await claimDownloadSession(claimContext);
    const rawDownloadToken = downloadPath.replace("/download/", "");

    const { authorizeDownloadGrant } = await import("./download-auth");
    const downloadContext = await authorizeDownloadGrant(rawDownloadToken);

    const { downloadOriginalFile, downloadBundle } = await import("./downloads");
    const individualResult = await downloadOriginalFile(downloadContext, fixture.file.id, { userAgent: "vitest", ip: "127.0.0.1" });
    expect(individualResult.url).toContain("http");

    const bundleResult = await downloadBundle(downloadContext, { userAgent: "vitest", ip: "127.0.0.1" });
    expect(bundleResult.url).toContain("http");
  });
});

describe("PREVIEW_ONLY delivery mode", () => {
  it("never allows approval, payment, or a download grant — only comments/change requests and creator closure", async () => {
    const fixture = await createInReviewWorkspaceFixture({ title: "IT Preview-Only Workspace", deliveryMode: "PREVIEW_ONLY" });

    const { authorizeReviewToken } = await import("./review-auth");
    const context = await authorizeReviewToken(fixture.reviewToken);
    const { approveWorkspace, ApprovalBlockedError } = await import("./approvals");
    await expect(approveWorkspace(context, { reviewerName: "Test Reviewer", termsAccepted: true })).rejects.toBeInstanceOf(
      ApprovalBlockedError,
    );

    const stillInReview = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(stillInReview.status).toBe("IN_REVIEW");
    expect(await prisma.workspaceApproval.count({ where: { workspaceId: fixture.workspace.id } })).toBe(0);
    expect(await prisma.payment.count({ where: { workspaceId: fixture.workspace.id } })).toBe(0);
    expect(await prisma.downloadGrant.count({ where: { workspaceId: fixture.workspace.id } })).toBe(0);

    signInAsArjun();
    const { closeWorkspaceForReview } = await import("./workspaces");
    await closeWorkspaceForReview(fixture.workspace.id);

    const closedWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(closedWorkspace.status).toBe("CLOSED");

    // A now-closed preview-only workspace can never be reopened or approved.
    const { InvalidStatusTransitionError } = await import("@/lib/workspace-transitions");
    await expect(closeWorkspaceForReview(fixture.workspace.id)).rejects.toBeInstanceOf(InvalidStatusTransitionError);

    // The master review portal is now read-only — no new client comments.
    const { addClientReviewComment, ReviewPortalReadOnlyError } = await import("./review-comments");
    const closedContext = await authorizeReviewToken(fixture.reviewToken);
    await expect(addClientReviewComment(closedContext, { body: "Can I still comment?" })).rejects.toBeInstanceOf(
      ReviewPortalReadOnlyError,
    );
  });
});
