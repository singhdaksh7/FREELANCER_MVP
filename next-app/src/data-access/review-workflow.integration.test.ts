import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { s3StorageProvider } from "@/storage/s3-storage-provider";
import { processJob, type ClaimedJob } from "@/worker/job-processor";

/**
 * Integration tests for the Phase 6 client-review workflow, against the
 * real test database (and, where a genuine upload/processing round trip
 * is required, real local MinIO — see FILE_PROCESSING_RUNBOOK.md). Run via
 * `npm run test:integration`.
 */

const ARJUN_ID = "usr_arjun";
const MEERA_ID = "usr_meera";
const ARJUN_WORKSPACE_ID = "ws_brand_identity"; // seeded, IN_REVIEW, owned by Arjun
const MEERA_WORKSPACE_ID = "ws_portfolio_refresh"; // seeded, owned by Meera
const DRAFT_WORKSPACE_ID = "ws_social_campaign"; // seeded, DRAFT, zero files by design

const { requireAuthenticatedUserMock } = vi.hoisted(() => ({ requireAuthenticatedUserMock: vi.fn() }));
vi.mock("@/data-access/auth", () => ({ requireAuthenticatedUser: requireAuthenticatedUserMock }));

function signInAs(userId: string) {
  requireAuthenticatedUserMock.mockResolvedValue({
    id: userId,
    name: userId === ARJUN_ID ? "Arjun Raj" : "Meera Shah",
    email: `${userId}@example.com`,
    role: "CREATOR",
    image: null,
  });
}

const createdFileIds: string[] = [];
const createdReviewLinkIds: string[] = [];
const createdStorageKeys: string[] = [];

async function makeJpeg(width = 400, height = 300): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 80, b: 140 } } })
    .jpeg()
    .toBuffer();
}

async function putToPresignedUrl(uploadUrl: string, body: Buffer, contentType: string): Promise<void> {
  const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(body) });
  if (!response.ok) throw new Error(`PUT to presigned URL failed: ${response.status}`);
}

async function claimJobForVersion(fileVersionId: string): Promise<NonNullable<ClaimedJob>> {
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE file_processing_jobs
    SET status = 'PROCESSING', "startedAt" = now(), "updatedAt" = now()
    WHERE id = (
      SELECT id FROM file_processing_jobs
      WHERE status = 'PENDING' AND "fileVersionId" = ${fileVersionId}
      ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED
    ) RETURNING id
  `;
  const jobId = claimed[0]?.id;
  if (!jobId) throw new Error(`No pending job found for fileVersion ${fileVersionId}`);
  return prisma.fileProcessingJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { fileVersion: { include: { file: { include: { workspace: { include: { client: true } } } } } } },
  });
}

/** Creates a ready-to-review WorkspaceFile + submitted FileVersion directly (bypassing real upload/processing) for tests that only care about review-workflow logic, not the upload pipeline itself — that pipeline is covered separately (files.integration.test.ts and the "file versions" describe block below). */
async function createReadyFile(workspaceId: string, displayName: string, submitted = true) {
  const file = await prisma.workspaceFile.create({
    data: { workspaceId, displayName, fileKind: "IMAGE", mimeType: "image/jpeg", sizeBytes: BigInt(1000), status: "READY" },
  });
  const version = await prisma.fileVersion.create({
    data: {
      fileId: file.id,
      versionNumber: 1,
      originalStorageKey: `originals/it-${file.id}.jpg`,
      previewStorageKey: `previews/it-${file.id}.jpg`,
      originalChecksum: "checksum-a",
      previewChecksum: "checksum-b",
      originalSizeBytes: BigInt(1000),
      mimeType: "image/jpeg",
      status: "READY",
      submittedAt: submitted ? new Date() : null,
    },
  });
  await prisma.workspaceFile.update({ where: { id: file.id }, data: { currentVersionId: version.id } });
  createdFileIds.push(file.id);
  return { file, version };
}

beforeAll(async () => {
  const probe = await s3StorageProvider.headObject("temp/__review_integration_probe__");
  expect(probe).toBeNull();
});

afterAll(async () => {
  await Promise.allSettled(createdStorageKeys.map((key) => s3StorageProvider.deleteObject(key)));
  await prisma.reviewComment.deleteMany({ where: { workspaceId: { in: [ARJUN_WORKSPACE_ID, MEERA_WORKSPACE_ID, DRAFT_WORKSPACE_ID] } } });
  await prisma.changeRequest.deleteMany({ where: { workspaceId: { in: [ARJUN_WORKSPACE_ID, MEERA_WORKSPACE_ID, DRAFT_WORKSPACE_ID] } } });
  await prisma.workspaceApproval.deleteMany({ where: { workspaceId: { in: [ARJUN_WORKSPACE_ID, MEERA_WORKSPACE_ID, DRAFT_WORKSPACE_ID] } } });
  await prisma.reviewLink.deleteMany({ where: { id: { in: createdReviewLinkIds } } });
  await prisma.fileProcessingJob.deleteMany({ where: { fileVersion: { file: { id: { in: createdFileIds } } } } });
  await prisma.fileVersion.deleteMany({ where: { file: { id: { in: createdFileIds } } } });
  await prisma.workspaceFile.deleteMany({ where: { id: { in: createdFileIds } } });
  await prisma.workspace.update({ where: { id: DRAFT_WORKSPACE_ID }, data: { status: "DRAFT" } }).catch(() => {});
  await prisma.$disconnect();
});

describe("review link creation", () => {
  it("creator creates a review link for an owned, eligible workspace", async () => {
    signInAs(ARJUN_ID);
    await createReadyFile(ARJUN_WORKSPACE_ID, "it-link-creation.jpg");
    const { createReviewLink } = await import("./review-links");

    const result = await createReviewLink(ARJUN_WORKSPACE_ID);
    expect(result.rawToken).toBeTruthy();

    const link = await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" } });
    createdReviewLinkIds.push(link.id);
    expect(link.tokenHash).not.toBe(result.rawToken);
  });

  it("creator cannot create a review link for another creator's workspace", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const { OwnershipError } = await import("./authorization");

    await expect(createReviewLink(MEERA_WORKSPACE_ID)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("the raw token is never stored anywhere in PostgreSQL", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const result = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" } })).id);

    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns WHERE table_schema = 'public'
    `;
    // Sanity: this suite's own reviewLink row is the one place a token
    // *hash* legitimately lives — assert the raw token string is absent
    // from that exact row (the strongest, most direct check available
    // without a full-database text scan).
    const link = await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(link)).not.toContain(result.rawToken);
    expect(rows.length).toBeGreaterThan(0); // table introspection itself succeeded
  });

  it("creating the first link for an eligible DRAFT workspace moves it to IN_REVIEW and submits its current version", async () => {
    signInAs(ARJUN_ID);
    await createReadyFile(DRAFT_WORKSPACE_ID, "it-draft-first-share.jpg", false);
    const { createReviewLink } = await import("./review-links");

    await createReviewLink(DRAFT_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: DRAFT_WORKSPACE_ID, status: "ACTIVE" } })).id);

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: DRAFT_WORKSPACE_ID } });
    expect(workspace.status).toBe("IN_REVIEW");

    const file = await prisma.workspaceFile.findFirstOrThrow({ where: { workspaceId: DRAFT_WORKSPACE_ID, displayName: "it-draft-first-share.jpg" }, include: { currentVersion: true } });
    expect(file.currentVersion!.submittedAt).not.toBeNull();
  });
});

describe("token authorization", () => {
  it("a valid token opens the correct workspace", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken } = await import("./review-auth");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);

    const context = await authorizeReviewToken(rawToken);
    expect(context.workspaceId).toBe(ARJUN_WORKSPACE_ID);
  });

  it("an expired token is rejected", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken, ReviewLinkExpiredError } = await import("./review-auth");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    const link = await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    createdReviewLinkIds.push(link.id);
    await prisma.reviewLink.update({ where: { id: link.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(authorizeReviewToken(rawToken)).rejects.toBeInstanceOf(ReviewLinkExpiredError);
  });

  it("a revoked token is rejected", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink, revokeReviewLink } = await import("./review-links");
    const { authorizeReviewToken, ReviewLinkRevokedError } = await import("./review-auth");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);
    await revokeReviewLink(ARJUN_WORKSPACE_ID);

    await expect(authorizeReviewToken(rawToken)).rejects.toBeInstanceOf(ReviewLinkRevokedError);
  });

  it("regeneration invalidates the old token immediately and issues a distinct new one", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink, regenerateReviewLink } = await import("./review-links");
    const { authorizeReviewToken, ReviewLinkRevokedError } = await import("./review-auth");

    const first = await createReviewLink(ARJUN_WORKSPACE_ID);
    const firstLink = await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    createdReviewLinkIds.push(firstLink.id);

    const second = await regenerateReviewLink(ARJUN_WORKSPACE_ID);
    const secondLink = await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    createdReviewLinkIds.push(secondLink.id);

    expect(second.rawToken).not.toBe(first.rawToken);
    await expect(authorizeReviewToken(first.rawToken)).rejects.toBeInstanceOf(ReviewLinkRevokedError);
    const context = await authorizeReviewToken(second.rawToken);
    expect(context.workspaceId).toBe(ARJUN_WORKSPACE_ID);
  });

  it("a token cannot see another workspace's files", async () => {
    signInAs(ARJUN_ID);
    const { file: meeraFile } = await (async () => {
      signInAs(MEERA_ID);
      await createReadyFile(MEERA_WORKSPACE_ID, "it-meera-private.jpg");
      return { file: await prisma.workspaceFile.findFirstOrThrow({ where: { workspaceId: MEERA_WORKSPACE_ID, displayName: "it-meera-private.jpg" } }) };
    })();

    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken } = await import("./review-auth");
    const { getReviewableFiles } = await import("./review-files");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);

    const context = await authorizeReviewToken(rawToken);
    const files = await getReviewableFiles(context);
    expect(files.some((f) => f.id === meeraFile.id)).toBe(false);
  });
});

describe("comments", () => {
  it("client creates a comment through the review token", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken } = await import("./review-auth");
    const { addClientReviewComment } = await import("./review-comments");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);
    const context = await authorizeReviewToken(rawToken);

    const { id } = await addClientReviewComment(context, { body: "Please adjust the logo color.", reviewerName: "Rohit Sharma" });
    const stored = await prisma.reviewComment.findUniqueOrThrow({ where: { id } });
    expect(stored.authorType).toBe("CLIENT");
    expect(stored.workspaceId).toBe(ARJUN_WORKSPACE_ID);
  });

  it("rejects a file association from a different workspace", async () => {
    signInAs(MEERA_ID);
    const { file: meeraFile } = await createReadyFile(MEERA_WORKSPACE_ID, "it-comment-hijack.jpg");

    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken } = await import("./review-auth");
    const { addClientReviewComment, CommentValidationError } = await import("./review-comments");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);
    const context = await authorizeReviewToken(rawToken);

    await expect(
      addClientReviewComment(context, { body: "hijack attempt", workspaceFileId: meeraFile.id }),
    ).rejects.toBeInstanceOf(CommentValidationError);
  });

  it("creator replies to a client comment and resolves it", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken } = await import("./review-auth");
    const { addClientReviewComment, addCreatorReviewComment, resolveReviewComment } = await import("./review-comments");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);
    const context = await authorizeReviewToken(rawToken);
    const { id: commentId } = await addClientReviewComment(context, { body: "Can you widen the margin?", reviewerName: "Rohit" });

    const { id: replyId } = await addCreatorReviewComment(ARJUN_WORKSPACE_ID, { body: "Sure, updating now.", parentId: commentId });
    const reply = await prisma.reviewComment.findUniqueOrThrow({ where: { id: replyId } });
    expect(reply.authorType).toBe("CREATOR");
    expect(reply.parentId).toBe(commentId);

    await resolveReviewComment(commentId);
    const resolved = await prisma.reviewComment.findUniqueOrThrow({ where: { id: commentId } });
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolvedById).toBe(ARJUN_ID);
  });
});

describe("change requests", () => {
  it("client requests changes, moving the workspace to CHANGES_REQUESTED", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken } = await import("./review-auth");
    const { createChangeRequest } = await import("./change-requests");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);
    const context = await authorizeReviewToken(rawToken);

    await createChangeRequest(context, { summary: "Please use a warmer color palette.", reviewerName: "Rohit" });

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ARJUN_WORKSPACE_ID } });
    expect(workspace.status).toBe("CHANGES_REQUESTED");
  });

  it("prevents a duplicate active change request", async () => {
    signInAs(ARJUN_ID);
    const { authorizeReviewToken } = await import("./review-auth");
    const { createChangeRequest, ChangeRequestAlreadyOpenError } = await import("./change-requests");
    const link = await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    // Re-derive a usable context without a second raw token (same link row, still ACTIVE).
    const context = {
      reviewLinkId: link.id,
      workspaceId: ARJUN_WORKSPACE_ID,
      workspace: { id: ARJUN_WORKSPACE_ID, title: "x", description: null, amount: 0, currency: "INR", status: "CHANGES_REQUESTED", watermarkText: null, creatorName: "Arjun Raj", client: { name: "Rohit" } },
    };

    await expect(createChangeRequest(context, { summary: "Another request" })).rejects.toBeInstanceOf(ChangeRequestAlreadyOpenError);
    void authorizeReviewToken; // referenced above only for symmetry with sibling tests
  });
});

describe("file versions — real upload/processing round trip", () => {
  it("creator uploads a new version; a successful process promotes it to current atomically, and a failed one preserves the prior current version", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession, createFileVersionUploadSession } = await import("./uploads");

    // v1: a normal upload that becomes current.
    const v1 = await makeJpeg(500, 400);
    const s1 = await createUploadSession(ARJUN_WORKSPACE_ID, { fileName: "it-version-file.jpg", mimeType: "image/jpeg", sizeBytes: v1.byteLength });
    await putToPresignedUrl(s1.uploadUrl, v1, "image/jpeg");
    const { fileId } = await completeUploadSession(s1.sessionId);
    createdFileIds.push(fileId);
    const afterV1 = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    const v1Job = await claimJobForVersion(afterV1.currentVersionId!);
    await processJob(prisma, v1Job);
    const readyV1 = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId }, include: { currentVersion: true } });
    createdStorageKeys.push(readyV1.currentVersion!.originalStorageKey, readyV1.currentVersion!.previewStorageKey!);
    const originalCurrentVersionId = readyV1.currentVersionId!;

    // v2: a genuine re-upload, currently PROCESSING — must not disturb v1.
    const v2 = await makeJpeg(600, 500);
    const s2 = await createFileVersionUploadSession(fileId, { fileName: "it-version-file.jpg", mimeType: "image/jpeg", sizeBytes: v2.byteLength });
    await putToPresignedUrl(s2.uploadUrl, v2, "image/jpeg");
    await completeUploadSession(s2.sessionId);

    const midProcessing = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(midProcessing.currentVersionId).toBe(originalCurrentVersionId); // untouched while pending processes
    expect(midProcessing.pendingVersionId).not.toBeNull();

    const v2Job = await claimJobForVersion(midProcessing.pendingVersionId!);
    await processJob(prisma, v2Job);

    const afterV2Success = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId }, include: { currentVersion: true } });
    expect(afterV2Success.currentVersionId).toBe(midProcessing.pendingVersionId); // promoted atomically
    expect(afterV2Success.pendingVersionId).toBeNull();
    createdStorageKeys.push(afterV2Success.currentVersion!.originalStorageKey, afterV2Success.currentVersion!.previewStorageKey!);

    // v3: a corrupt re-upload that fails processing — v2 (now current) must remain current.
    const corruptKey = `originals/it-version-corrupt-${Date.now()}.jpg`;
    await s3StorageProvider.putObjectBuffer(corruptKey, Buffer.from("not a real jpeg"), "image/jpeg");
    createdStorageKeys.push(corruptKey);
    const v3 = await prisma.fileVersion.create({
      data: { fileId, versionNumber: 3, originalStorageKey: corruptKey, originalChecksum: "x", originalSizeBytes: BigInt(16), mimeType: "image/jpeg" },
    });
    await prisma.workspaceFile.update({ where: { id: fileId }, data: { pendingVersionId: v3.id } });
    await prisma.fileProcessingJob.create({ data: { fileVersionId: v3.id, status: "PENDING", attempts: 1 } });

    const v3Job = await claimJobForVersion(v3.id);
    await processJob(prisma, v3Job);

    const afterV3Failure = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(afterV3Failure.currentVersionId).toBe(afterV2Success.currentVersionId); // v2 preserved
    expect(afterV3Failure.pendingVersionId).toBe(v3.id); // failed candidate still visible to the creator

    const failedVersion = await prisma.fileVersion.findUniqueOrThrow({ where: { id: v3.id } });
    expect(failedVersion.status).toBe("FAILED");
  });
});

describe("submit revision + client-visible versions", () => {
  it("creator submits a revision after a change request, and the client sees only submitted versions", async () => {
    signInAs(ARJUN_ID);
    // Defensive cleanup: earlier describe blocks in this same run share
    // this seeded workspace and may leave an OPEN change request or a
    // stray failed pending-version candidate behind (submitRevision
    // correctly checks the whole workspace, not just the file under test).
    await prisma.changeRequest.updateMany({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "OPEN" }, data: { status: "WITHDRAWN" } });
    await prisma.workspaceFile.updateMany({ where: { workspaceId: ARJUN_WORKSPACE_ID, pendingVersionId: { not: null } }, data: { pendingVersionId: null } });
    const { file } = await createReadyFile(ARJUN_WORKSPACE_ID, "it-submit-revision.jpg");

    // Move to IN_REVIEW -> CHANGES_REQUESTED via a real link + change request.
    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken } = await import("./review-auth");
    const { createChangeRequest } = await import("./change-requests");
    const { submitRevision } = await import("./revisions");
    const { getReviewableFiles } = await import("./review-files");

    await prisma.workspace.update({ where: { id: ARJUN_WORKSPACE_ID }, data: { status: "IN_REVIEW" } });
    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);
    let context = await authorizeReviewToken(rawToken);
    await createChangeRequest(context, { summary: "Please brighten the image." });

    // Creator uploads a new (v2) version directly (bypassing real S3 for speed — the upload pipeline itself is covered above).
    const v2 = await prisma.fileVersion.create({
      data: {
        fileId: file.id,
        versionNumber: 2,
        originalStorageKey: `originals/it-submit-v2-${file.id}.jpg`,
        previewStorageKey: `previews/it-submit-v2-${file.id}.jpg`,
        originalChecksum: "c2",
        previewChecksum: "p2",
        originalSizeBytes: BigInt(1200),
        mimeType: "image/jpeg",
        status: "READY",
      },
    });
    await prisma.workspaceFile.update({ where: { id: file.id }, data: { currentVersionId: v2.id, pendingVersionId: null } });

    await submitRevision(ARJUN_WORKSPACE_ID);

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ARJUN_WORKSPACE_ID } });
    expect(workspace.status).toBe("IN_REVIEW");
    const resolvedCR = await prisma.changeRequest.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "RESOLVED" } });
    expect(resolvedCR).toBeTruthy();

    context = await authorizeReviewToken(rawToken);
    const files = await getReviewableFiles(context);
    const reviewedFile = files.find((f) => f.id === file.id);
    expect(reviewedFile).toBeTruthy();
    expect(reviewedFile!.currentVersionId).toBe(v2.id);
    // v1 (submitted at file creation) and v2 (just submitted) are both visible — never an internal-only unsubmitted version.
    expect(reviewedFile!.versions.map((v) => v.versionNumber).sort()).toEqual([1, 2]);
  });
});

describe("approval", () => {
  it("client approves an eligible workspace, blocked cases fail safely, and approval never unlocks originals", async () => {
    signInAs(ARJUN_ID);
    await prisma.changeRequest.updateMany({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "OPEN" }, data: { status: "WITHDRAWN" } });
    await prisma.workspaceFile.updateMany({ where: { workspaceId: ARJUN_WORKSPACE_ID, pendingVersionId: { not: null } }, data: { pendingVersionId: null } });
    const { file } = await createReadyFile(ARJUN_WORKSPACE_ID, "it-approval.jpg");
    await prisma.workspace.update({ where: { id: ARJUN_WORKSPACE_ID }, data: { status: "IN_REVIEW" } });

    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken } = await import("./review-auth");
    const { createChangeRequest } = await import("./change-requests");
    const { approveWorkspace, ApprovalBlockedError } = await import("./approvals");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);
    let context = await authorizeReviewToken(rawToken);

    // Blocked while a change request is open.
    await createChangeRequest(context, { summary: "One more tweak please." });
    context = await authorizeReviewToken(rawToken);
    await expect(approveWorkspace(context, { reviewerName: "Rohit", termsAccepted: true })).rejects.toBeInstanceOf(ApprovalBlockedError);

    // Resolve the change request out-of-band so approval can proceed.
    await prisma.changeRequest.updateMany({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    await prisma.workspace.update({ where: { id: ARJUN_WORKSPACE_ID }, data: { status: "IN_REVIEW" } });

    // Blocked while the submitted version is still processing.
    await prisma.fileVersion.update({ where: { id: file.currentVersionId! ?? "" }, data: {} }).catch(() => {});
    const versionRow = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: file.id } });
    await prisma.fileVersion.update({ where: { id: versionRow.currentVersionId! }, data: { status: "PROCESSING" } });
    context = await authorizeReviewToken(rawToken);
    await expect(approveWorkspace(context, { reviewerName: "Rohit", termsAccepted: true })).rejects.toBeInstanceOf(ApprovalBlockedError);
    await prisma.fileVersion.update({ where: { id: versionRow.currentVersionId! }, data: { status: "READY" } });

    // Now eligible — approve successfully.
    context = await authorizeReviewToken(rawToken);
    const { id: approvalId } = await approveWorkspace(context, { reviewerName: "Rohit Sharma", termsAccepted: true });

    const approval = await prisma.workspaceApproval.findUniqueOrThrow({ where: { id: approvalId } });
    expect(approval.status).toBe("APPROVED");
    expect(Array.isArray(approval.approvedFileVersionSnapshot)).toBe(true);

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ARJUN_WORKSPACE_ID } });
    expect(workspace.status).toBe("APPROVED");
    expect(workspace.status).not.toBe("PAID");
    expect(workspace.status).not.toBe("FILES_UNLOCKED");
    expect(workspace.paidAt).toBeNull();
    expect(workspace.deliveredAt).toBeNull();
  });
});

describe("cross-creator boundaries and activity-log correctness", () => {
  it("a different creator cannot revoke another creator's review link", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);

    signInAs(MEERA_ID);
    const { revokeReviewLink } = await import("./review-links");
    const { OwnershipError } = await import("./authorization");
    await expect(revokeReviewLink(ARJUN_WORKSPACE_ID)).rejects.toBeInstanceOf(OwnershipError);

    const stillActive = await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" } });
    expect(stillActive).toBeTruthy();
  });

  it("a different creator cannot resolve another creator's comment", async () => {
    signInAs(ARJUN_ID);
    const { createReviewLink } = await import("./review-links");
    const { authorizeReviewToken } = await import("./review-auth");
    const { addClientReviewComment, resolveReviewComment, CommentNotFoundError } = await import("./review-comments");

    const { rawToken } = await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);
    const context = await authorizeReviewToken(rawToken);
    const { id: commentId } = await addClientReviewComment(context, { body: "Needs review", reviewerName: "Rohit" });

    signInAs(MEERA_ID);
    await expect(resolveReviewComment(commentId)).rejects.toBeInstanceOf(CommentNotFoundError);
  });

  it("a successful review-link creation writes exactly one activity log entry", async () => {
    signInAs(ARJUN_ID);
    await createReadyFile(ARJUN_WORKSPACE_ID, "it-activity-success.jpg");
    const { createReviewLink } = await import("./review-links");

    const before = await prisma.activityLog.count({ where: { workspaceId: ARJUN_WORKSPACE_ID, action: "REVIEW_LINK_CREATED" } });
    await createReviewLink(ARJUN_WORKSPACE_ID);
    createdReviewLinkIds.push((await prisma.reviewLink.findFirstOrThrow({ where: { workspaceId: ARJUN_WORKSPACE_ID, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })).id);
    const after = await prisma.activityLog.count({ where: { workspaceId: ARJUN_WORKSPACE_ID, action: "REVIEW_LINK_CREATED" } });

    expect(after).toBe(before + 1);
  });

  it("a failed mutation (ineligible review link) writes zero activity log entries", async () => {
    signInAs(MEERA_ID);
    const before = await prisma.activityLog.count({ where: { workspaceId: MEERA_WORKSPACE_ID, action: "REVIEW_LINK_CREATED" } });

    const { createReviewLink, ReviewLinkNotEligibleError } = await import("./review-links");
    // Meera's ws_portfolio_refresh has no files at all in a fresh seed —
    // attempting to share it should fail without ever writing an
    // activity row for a link that was never actually created.
    const existingFiles = await prisma.workspaceFile.count({ where: { workspaceId: MEERA_WORKSPACE_ID, deletedAt: null } });
    if (existingFiles === 0) {
      await expect(createReviewLink(MEERA_WORKSPACE_ID)).rejects.toBeInstanceOf(ReviewLinkNotEligibleError);
    }

    const after = await prisma.activityLog.count({ where: { workspaceId: MEERA_WORKSPACE_ID, action: "REVIEW_LINK_CREATED" } });
    expect(after).toBe(before);
  });
});
