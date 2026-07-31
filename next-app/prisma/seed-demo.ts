import "dotenv/config";
import {
  PrismaClient,
  WorkspaceStatus,
  DeliveryMode,
  PaymentStatus,
  FileKind,
  FileStatus,
  FileVersionStatus,
  ReviewAuthorType,
  AnnotationType,
  PayoutLedgerType,
  PayoutStatus,
} from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

/**
 * Demo-environment seed (APP_ENV=demo only — see scripts/guard-demo-db.mjs,
 * which refuses to run this anywhere else). Every row is upserted by a
 * fixed, hardcoded id or unique field, so running this script any number
 * of times against the same (Neon demo) database converges to the same
 * dataset rather than growing it or erroring — it never deletes anything,
 * unlike the local/test-only prisma/seed.ts.
 *
 * This intentionally seeds representative workspaces for both surviving
 * DeliveryMode values (PAYMENT_REQUIRED / APPROVAL_ONLY — PREVIEW_ONLY was
 * retired in Phase 8, see DELIVERY_MODES.md) plus version history,
 * comments, pins/annotations, a zero-fee payment breakdown, and
 * payout-ledger data — see FOUNDER_DEMO_CHECKLIST.md for the walkthrough
 * this data supports. Platform fee is always 0 (Phase 8) — see
 * PLATFORM_FEE_AND_PAYOUT_LEDGER.md.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "InlayDemo@2026";

async function seedFreelancer() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const freelancer = await prisma.user.upsert({
    where: { email: "freelancer@inlay-demo.app" },
    update: { name: "Inlay Demo Freelancer", passwordHash, role: "CREATOR" },
    create: {
      id: "demo_usr_freelancer",
      name: "Inlay Demo Freelancer",
      email: "freelancer@inlay-demo.app",
      passwordHash,
      role: "CREATOR",
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@inlay-demo.app" },
    update: { name: "Inlay Demo Admin", passwordHash, role: "ADMIN" },
    create: {
      id: "demo_usr_admin",
      name: "Inlay Demo Admin",
      email: "admin@inlay-demo.app",
      passwordHash,
      role: "ADMIN",
    },
  });

  return freelancer;
}

async function seedClients(creatorId: string) {
  const orion = await prisma.client.upsert({
    where: { id: "demo_cli_orion" },
    update: {},
    create: {
      id: "demo_cli_orion",
      creatorId,
      name: "Orion Retail Co",
      email: "hello@orionretail.example",
      company: "Orion Retail Co",
      phone: "+91 90000 10001",
    },
  });
  const atlas = await prisma.client.upsert({
    where: { id: "demo_cli_atlas" },
    update: {},
    create: {
      id: "demo_cli_atlas",
      creatorId,
      name: "Atlas Media Group",
      email: "projects@atlasmedia.example",
      company: "Atlas Media Group",
      phone: "+91 90000 10002",
    },
  });
  const nimbus = await prisma.client.upsert({
    where: { id: "demo_cli_nimbus" },
    update: {},
    create: {
      id: "demo_cli_nimbus",
      creatorId,
      name: "Nimbus Fashion House",
      email: "studio@nimbusfashion.example",
      company: "Nimbus Fashion House",
      phone: "+91 90000 10003",
    },
  });

  return { orion, atlas, nimbus };
}

async function seedPaymentRequiredWorkspace(creatorId: string, client: { id: string; name: string }) {
  const workspace = await prisma.workspace.upsert({
    where: { id: "demo_ws_payment_required" },
    update: {},
    create: {
      id: "demo_ws_payment_required",
      creatorId,
      clientId: client.id,
      clientName: client.name,
      title: "Product Launch Video Package",
      description: "Hero product video, three social cutdowns, and a poster frame set for the Q3 launch.",
      currency: "INR",
      amount: "25000.00",
      deliveryMode: DeliveryMode.PAYMENT_REQUIRED,
      status: WorkspaceStatus.PAID,
      progress: 100,
      approvedAt: new Date("2026-07-10T11:00:00Z"),
      paidAt: new Date("2026-07-10T11:15:00Z"),
      createdAt: new Date("2026-07-01T09:00:00Z"),
      updatedAt: new Date("2026-07-10T11:15:00Z"),
    },
  });

  const workspaceFile = await prisma.workspaceFile.upsert({
    where: { id: "demo_wf_hero_poster" },
    update: {},
    create: {
      id: "demo_wf_hero_poster",
      workspaceId: workspace.id,
      displayName: "hero-poster-frame.jpg",
      fileKind: FileKind.IMAGE,
      mimeType: "image/jpeg",
      sizeBytes: BigInt(2_400_000),
      status: FileStatus.READY,
    },
  });

  const versionOne = await prisma.fileVersion.upsert({
    where: { id: "demo_fv_hero_poster_v1" },
    update: {},
    create: {
      id: "demo_fv_hero_poster_v1",
      fileId: workspaceFile.id,
      versionNumber: 1,
      originalStorageKey: "demo/originals/demo_fv_hero_poster_v1.jpg",
      previewStorageKey: "demo/previews/demo_fv_hero_poster_v1.jpg",
      originalChecksum: "demo-checksum-hero-poster-v1",
      originalSizeBytes: BigInt(2_400_000),
      previewSizeBytes: BigInt(180_000),
      mimeType: "image/jpeg",
      width: 3000,
      height: 2000,
      status: FileVersionStatus.READY,
      submittedAt: new Date("2026-07-02T10:00:00Z"),
      createdAt: new Date("2026-07-02T10:00:00Z"),
    },
  });

  const versionTwo = await prisma.fileVersion.upsert({
    where: { id: "demo_fv_hero_poster_v2" },
    update: {},
    create: {
      id: "demo_fv_hero_poster_v2",
      fileId: workspaceFile.id,
      versionNumber: 2,
      originalStorageKey: "demo/originals/demo_fv_hero_poster_v2.jpg",
      previewStorageKey: "demo/previews/demo_fv_hero_poster_v2.jpg",
      originalChecksum: "demo-checksum-hero-poster-v2",
      originalSizeBytes: BigInt(2_550_000),
      previewSizeBytes: BigInt(190_000),
      mimeType: "image/jpeg",
      width: 3000,
      height: 2000,
      status: FileVersionStatus.READY,
      submittedAt: new Date("2026-07-08T14:00:00Z"),
      createdAt: new Date("2026-07-08T14:00:00Z"),
    },
  });

  await prisma.workspaceFile.update({
    where: { id: workspaceFile.id },
    data: { currentVersionId: versionTwo.id },
  });

  const reviewLink = await prisma.reviewLink.upsert({
    where: { id: "demo_rl_payment_required" },
    update: {},
    create: {
      id: "demo_rl_payment_required",
      workspaceId: workspace.id,
      tokenHash: "demo_seed_hash_payment_required",
      tokenPrefix: "demopr01",
      expiresAt: new Date("2027-07-10T11:00:00Z"),
      createdById: creatorId,
    },
  });

  const comment = await prisma.reviewComment.upsert({
    where: { id: "demo_rc_hero_poster_pin" },
    update: {},
    create: {
      id: "demo_rc_hero_poster_pin",
      workspaceId: workspace.id,
      workspaceFileId: workspaceFile.id,
      fileVersionId: versionOne.id,
      authorType: ReviewAuthorType.CLIENT,
      reviewerName: "Orion Retail Co",
      reviewerEmail: "hello@orionretail.example",
      body: "Can we brighten the logo lockup in the bottom-right corner?",
      status: "RESOLVED",
      pinX: 0.82,
      pinY: 0.88,
      pinNumber: 1,
      resolvedAt: new Date("2026-07-08T13:30:00Z"),
      createdAt: new Date("2026-07-03T09:15:00Z"),
    },
  });

  await prisma.reviewAnnotation.upsert({
    where: { id: "demo_ann_hero_poster_circle" },
    update: {},
    create: {
      id: "demo_ann_hero_poster_circle",
      commentId: comment.id,
      workspaceId: workspace.id,
      workspaceFileId: workspaceFile.id,
      fileVersionId: versionOne.id,
      type: AnnotationType.CIRCLE,
      geometry: { cx: 0.82, cy: 0.88, r: 0.05 },
      createdAt: new Date("2026-07-03T09:15:00Z"),
    },
  });

  const approval = await prisma.workspaceApproval.upsert({
    where: { id: "demo_appr_payment_required" },
    update: {},
    create: {
      id: "demo_appr_payment_required",
      workspaceId: workspace.id,
      reviewLinkId: reviewLink.id,
      approvedFileVersionSnapshot: [{ workspaceFileId: workspaceFile.id, fileVersionId: versionTwo.id }],
      approvedAmount: "25000.00",
      approvedCurrency: "INR",
      reviewerName: "Orion Retail Co",
      reviewerEmail: "hello@orionretail.example",
      status: "APPROVED",
      termsAccepted: true,
      approvedAt: new Date("2026-07-10T10:45:00Z"),
    },
  });

  const payment = await prisma.payment.upsert({
    where: { id: "demo_pay_payment_required" },
    update: {},
    create: {
      id: "demo_pay_payment_required",
      workspaceId: workspace.id,
      approvalId: approval.id,
      reviewLinkId: reviewLink.id,
      amount: "25000.00",
      amountSubunits: BigInt(2_500_000),
      currency: "INR",
      status: PaymentStatus.PAID,
      gateway: "razorpay",
      gatewayOrderId: "order_demo_payment_required",
      gatewayPaymentId: "pay_demo_payment_required",
      gatewaySignatureVerifiedAt: new Date("2026-07-10T11:14:00Z"),
      capturedAt: new Date("2026-07-10T11:15:00Z"),
      feeAmount: "0.00",
      paidAt: new Date("2026-07-10T11:15:00Z"),
      attemptNumber: 1,
      idempotencyKey: "demo-seed-idem-payment-required",
      createdAt: new Date("2026-07-10T10:50:00Z"),
      metadata: { demo: true, note: "Razorpay TEST MODE — no real funds moved." },
    },
  });

  await prisma.paymentBreakdown.upsert({
    where: { paymentId: payment.id },
    update: {},
    create: {
      paymentId: payment.id,
      projectAmountSubunits: BigInt(2_500_000),
      clientChargedSubunits: BigInt(2_500_000),
      platformFeeBps: 0,
      platformFeeSubunits: BigInt(0),
      freelancerPayableSubunits: BigInt(2_500_000),
      currency: "INR",
      calculatedAt: new Date("2026-07-10T11:15:00Z"),
    },
  });

  await prisma.payoutLedgerEntry.upsert({
    where: { id: "demo_ple_credit_payment_required" },
    update: {},
    create: {
      id: "demo_ple_credit_payment_required",
      creatorId,
      paymentId: payment.id,
      type: PayoutLedgerType.PAYMENT_CREDIT,
      amountSubunits: BigInt(2_500_000),
      currency: "INR",
      status: PayoutStatus.AVAILABLE,
      availableAt: new Date("2026-07-11T11:15:00Z"),
      createdAt: new Date("2026-07-10T11:15:00Z"),
      metadata: { demo: true, simulatedBy: "fake-payout-provider" },
    },
  });

  await prisma.creatorBalanceAccount.upsert({
    where: { creatorId },
    update: { availableSubunits: BigInt(2_500_000) },
    create: {
      creatorId,
      currency: "INR",
      pendingSubunits: BigInt(0),
      availableSubunits: BigInt(2_500_000),
      paidOutSubunits: BigInt(0),
    },
  });

  return workspace;
}

async function seedApprovalOnlyWorkspace(creatorId: string, client: { id: string; name: string }) {
  const workspace = await prisma.workspace.upsert({
    where: { id: "demo_ws_approval_only" },
    update: {},
    create: {
      id: "demo_ws_approval_only",
      creatorId,
      clientId: client.id,
      clientName: client.name,
      title: "Brand Style Guide Refresh",
      description: "Updated brand guidelines document — approval-only, released manually once signed off.",
      currency: "INR",
      deliveryMode: DeliveryMode.APPROVAL_ONLY,
      status: WorkspaceStatus.IN_REVIEW,
      progress: 60,
      createdAt: new Date("2026-07-14T09:00:00Z"),
      updatedAt: new Date("2026-07-20T15:00:00Z"),
    },
  });

  await prisma.reviewLink.upsert({
    where: { id: "demo_rl_approval_only" },
    update: {},
    create: {
      id: "demo_rl_approval_only",
      workspaceId: workspace.id,
      tokenHash: "demo_seed_hash_approval_only",
      tokenPrefix: "demoao01",
      expiresAt: new Date("2027-07-14T09:00:00Z"),
      createdById: creatorId,
    },
  });

  await prisma.reviewComment.upsert({
    where: { id: "demo_rc_approval_only_note" },
    update: {},
    create: {
      id: "demo_rc_approval_only_note",
      workspaceId: workspace.id,
      authorType: ReviewAuthorType.CLIENT,
      reviewerName: "Atlas Media Group",
      reviewerEmail: "projects@atlasmedia.example",
      body: "This looks great — approving once the secondary color ramp is finalized.",
      status: "OPEN",
      createdAt: new Date("2026-07-20T15:00:00Z"),
    },
  });

  return workspace;
}

/**
 * Second APPROVAL_ONLY example (id kept as "preview_only" for historical
 * continuity with earlier demo snapshots) — PREVIEW_ONLY itself was
 * retired in Phase 8, see DELIVERY_MODES.md.
 */
async function seedPreviewOnlyWorkspace(creatorId: string, client: { id: string; name: string }) {
  const workspace = await prisma.workspace.upsert({
    where: { id: "demo_ws_preview_only" },
    update: {},
    create: {
      id: "demo_ws_preview_only",
      creatorId,
      clientId: client.id,
      clientName: client.name,
      title: "Seasonal Lookbook Concepts",
      description: "Early concept previews for the winter lookbook — feedback only, no unlock/payment step.",
      currency: "INR",
      deliveryMode: DeliveryMode.APPROVAL_ONLY,
      status: WorkspaceStatus.IN_REVIEW,
      progress: 30,
      watermarkText: "INLAY PREVIEW",
      createdAt: new Date("2026-07-22T09:00:00Z"),
      updatedAt: new Date("2026-07-24T10:00:00Z"),
    },
  });

  await prisma.reviewLink.upsert({
    where: { id: "demo_rl_preview_only" },
    update: {},
    create: {
      id: "demo_rl_preview_only",
      workspaceId: workspace.id,
      tokenHash: "demo_seed_hash_preview_only",
      tokenPrefix: "demopo01",
      expiresAt: new Date("2027-07-22T09:00:00Z"),
      createdById: creatorId,
    },
  });

  await prisma.reviewComment.upsert({
    where: { id: "demo_rc_preview_only_note" },
    update: {},
    create: {
      id: "demo_rc_preview_only_note",
      workspaceId: workspace.id,
      authorType: ReviewAuthorType.CLIENT,
      reviewerName: "Nimbus Fashion House",
      reviewerEmail: "studio@nimbusfashion.example",
      body: "Love the direction on concept 2 — can we see it in a darker palette too?",
      status: "OPEN",
      createdAt: new Date("2026-07-24T10:00:00Z"),
    },
  });

  return workspace;
}

async function main() {
  const freelancer = await seedFreelancer();
  const { orion, atlas, nimbus } = await seedClients(freelancer.id);

  await seedPaymentRequiredWorkspace(freelancer.id, orion);
  await seedApprovalOnlyWorkspace(freelancer.id, atlas);
  await seedPreviewOnlyWorkspace(freelancer.id, nimbus);

  console.log(
    `✓ Demo seed complete — freelancer (${freelancer.email}), admin (admin@inlay-demo.app), ` +
      `3 clients, 3 workspaces (PAYMENT_REQUIRED / APPROVAL_ONLY / APPROVAL_ONLY).`,
  );
}

main()
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
