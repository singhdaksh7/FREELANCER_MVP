import "dotenv/config";
import { pathToFileURL } from "node:url";
import { PrismaClient, WorkspaceStatus, PaymentStatus, NotificationType } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

/**
 * Deterministic demo seed. Re-running it does not create uncontrolled
 * duplicates: each demo user is upserted by (unique) email, then every
 * child record for that user is wiped and recreated with fixed,
 * hardcoded ids — so the dataset is byte-identical after every run
 * rather than growing.
 *
 * IMPORTANT: never point this at anything but a local/dev/test database.
 * It deletes and recreates all data belonging to the two seed accounts.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "Demo@12345";

/** Exported (not just called from main()) so integration tests can exercise the same reset logic directly against the test database — see src/data-access/seed-idempotency.integration.test.ts. */
export async function resetCreatorData(creatorId: string) {
  const workspaces = await prisma.workspace.findMany({ where: { creatorId }, select: { id: true } });
  const workspaceIds = workspaces.map((w) => w.id);

  if (workspaceIds.length > 0) {
    // Workspace cascades to WorkspaceFile/FileVersion/WorkspaceApproval
    // directly, but DownloadGrantFile, DownloadGrant, DeliveryBundle, and
    // Payment each hold an onDelete: Restrict foreign key into
    // WorkspaceFile/FileVersion/WorkspaceApproval too (see schema.prisma).
    // Postgres does not guarantee those Restrict checks run *after* the
    // sibling Cascade paths from a single `DELETE FROM workspaces`
    // statement finish clearing the rows they'd otherwise block — in
    // practice, once E2E/manual testing has created a real download
    // grant, delivery bundle, or payment against a seeded workspace, the
    // plain `workspace.deleteMany()` below fails with a foreign-key
    // violation. Deleting these leaf-first, in dependency order, makes
    // this reset safe regardless of what real (non-decorative) data a
    // workspace has accumulated.
    await prisma.downloadGrantFile.deleteMany({ where: { grant: { workspaceId: { in: workspaceIds } } } });
    await prisma.downloadGrant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.deliveryBundle.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.payment.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspaceApproval.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  }

  // SupportTicket.workspace and PayoutLedgerEntry.payment are both
  // onDelete: SetNull (a ticket outlives its workspace, a ledger entry
  // outlives the payment it was credited from — see
  // SUPPORT_AND_DISPUTE_ARCHITECTURE.md / PLATFORM_FEE_AND_PAYOUT_LEDGER.md),
  // and both key off `creatorId` with onDelete: Cascade from User — which
  // never fires here, since this reset upserts the User rather than
  // deleting it. Left alone, both would silently survive a workspace/
  // payment delete and accumulate a little more on every reset/reseed
  // cycle. Delete both explicitly by creatorId so the seed stays a true
  // no-growth reset.
  await prisma.supportTicketMessage.deleteMany({ where: { ticket: { creatorId } } });
  await prisma.supportTicket.deleteMany({ where: { creatorId } });
  await prisma.payoutLedgerEntry.deleteMany({ where: { creatorId } });

  // Order matters: Workspace -> Client uses onDelete: Restrict, so
  // workspaces (and everything cascading from them) must go first.
  await prisma.notification.deleteMany({ where: { userId: creatorId } });
  await prisma.workspace.deleteMany({ where: { creatorId } });
  await prisma.client.deleteMany({ where: { creatorId } });
}

export async function seedArjun() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const arjun = await prisma.user.upsert({
    where: { email: "arjun@example.com" },
    update: { name: "Arjun Raj", passwordHash, role: "CREATOR" },
    create: {
      id: "usr_arjun",
      name: "Arjun Raj",
      email: "arjun@example.com",
      passwordHash,
      role: "CREATOR",
      image:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256",
    },
  });

  await resetCreatorData(arjun.id);

  const rohit = await prisma.client.create({
    data: {
      id: "cli_rohit",
      creatorId: arjun.id,
      name: "Rohit Sharma",
      email: "rohit@designtech.io",
      company: "DesignTech Ltd",
      phone: "+91 98200 11223",
    },
  });
  const priya = await prisma.client.create({
    data: {
      id: "cli_priya",
      creatorId: arjun.id,
      name: "Priya Verma",
      email: "priya@fashioncraft.com",
      company: "FashionCraft",
      phone: "+91 98200 33445",
    },
  });
  const karan = await prisma.client.create({
    data: {
      id: "cli_karan",
      creatorId: arjun.id,
      name: "Karan Mehta",
      email: "karan@mehtadining.in",
      company: "Mehta Hospitality",
      phone: "+91 98200 55667",
    },
  });
  const ananya = await prisma.client.create({
    data: {
      id: "cli_ananya",
      creatorId: arjun.id,
      name: "Ananya Kapoor",
      email: "ananya@luxeliving.co",
      company: "Luxe Living",
      phone: "+91 98200 77889",
    },
  });

  const brandIdentity = await prisma.workspace.create({
    data: {
      id: "ws_brand_identity",
      creatorId: arjun.id,
      clientId: rohit.id,
      title: "Brand Identity Design",
      description:
        "Complete brand guidelines, logotype variations, color palette system, and social media assets.",
      currency: "INR",
      amount: "25000.00",
      status: WorkspaceStatus.IN_REVIEW,
      progress: 45,
      createdAt: new Date("2026-07-20T10:30:00Z"),
      updatedAt: new Date("2026-07-28T08:30:00Z"),
    },
  });
  const ecommerce = await prisma.workspace.create({
    data: {
      id: "ws_ecommerce_ui",
      creatorId: arjun.id,
      clientId: priya.id,
      title: "E-commerce Website UI",
      description:
        "High-fidelity Figma wireframes and mobile responsive design system for online apparel store.",
      currency: "INR",
      amount: "45000.00",
      status: WorkspaceStatus.APPROVED,
      progress: 75,
      approvedAt: new Date("2026-07-27T16:20:00Z"),
      createdAt: new Date("2026-07-15T09:00:00Z"),
      updatedAt: new Date("2026-07-27T16:20:00Z"),
    },
  });
  const productPkg = await prisma.workspace.create({
    data: {
      id: "ws_product_pkg",
      creatorId: arjun.id,
      clientId: karan.id,
      title: "Product Packaging Design",
      description: "3D render mockups and print-ready die-cut vector files for organic coffee box.",
      currency: "INR",
      amount: "30000.00",
      status: WorkspaceStatus.PAID,
      progress: 100,
      approvedAt: new Date("2026-07-17T11:00:00Z"),
      paidAt: new Date("2026-07-18T15:45:00Z"),
      createdAt: new Date("2026-07-02T14:00:00Z"),
      updatedAt: new Date("2026-07-18T15:45:00Z"),
    },
  });
  const socialCampaign = await prisma.workspace.create({
    data: {
      id: "ws_social_campaign",
      creatorId: arjun.id,
      clientId: ananya.id,
      title: "Social Media Campaign",
      description:
        "Platform-ready social templates, reel cover set, and campaign content calendar for Luxe Living's festive launch.",
      currency: "INR",
      amount: "18000.00",
      status: WorkspaceStatus.DRAFT,
      progress: 10,
      createdAt: new Date("2026-07-25T11:00:00Z"),
      updatedAt: new Date("2026-07-26T09:15:00Z"),
    },
  });

  await prisma.activityLog.createMany({
    data: [
      { workspaceId: brandIdentity.id, action: "Workspace Created", actorType: "CREATOR", actorName: "Arjun Raj", createdAt: new Date("2026-07-20T10:30:00Z") },
      { workspaceId: brandIdentity.id, action: "Payment Gated Link Generated (₹25,000)", actorType: "CREATOR", actorName: "Arjun Raj", createdAt: new Date("2026-07-20T10:35:00Z") },
      { workspaceId: brandIdentity.id, action: "Client Opened Review Link", actorType: "CLIENT", actorName: "Rohit Sharma", createdAt: new Date("2026-07-21T14:15:00Z") },
      { workspaceId: brandIdentity.id, action: "Changes Requested (V1)", actorType: "CLIENT", actorName: "Rohit Sharma", createdAt: new Date("2026-07-22T11:00:00Z") },
      { workspaceId: brandIdentity.id, action: "Uploaded Version 2 Files", actorType: "CREATOR", actorName: "Arjun Raj", createdAt: new Date("2026-07-28T08:30:00Z") },
      { workspaceId: ecommerce.id, action: "Workspace Created", actorType: "CREATOR", actorName: "Arjun Raj", createdAt: new Date("2026-07-15T09:00:00Z") },
      { workspaceId: ecommerce.id, action: "Client Approved Work", actorType: "CLIENT", actorName: "Priya Verma", createdAt: new Date("2026-07-27T16:20:00Z") },
      { workspaceId: productPkg.id, action: "Workspace Created", actorType: "CREATOR", actorName: "Arjun Raj", createdAt: new Date("2026-07-02T14:00:00Z") },
      { workspaceId: productPkg.id, action: "Payment Received (₹30,000)", actorType: "SYSTEM", actorName: "Razorpay System", createdAt: new Date("2026-07-18T15:45:00Z") },
      { workspaceId: productPkg.id, action: "Files Unlocked for Download", actorType: "SYSTEM", actorName: "System", createdAt: new Date("2026-07-18T15:45:00Z") },
      { workspaceId: socialCampaign.id, action: "Workspace Created", actorType: "CREATOR", actorName: "Arjun Raj", createdAt: new Date("2026-07-25T11:00:00Z") },
      { workspaceId: socialCampaign.id, action: "Preview Watermarking Queued", actorType: "SYSTEM", actorName: "System", createdAt: new Date("2026-07-26T09:15:00Z") },
    ],
  });

  // Phase 7 — Payment/WorkspaceApproval now require a reviewLinkId. These
  // seeded workspaces predate the real review/approval pipeline (no real
  // WorkspaceFile/FileVersion rows), so a minimal (already-consumed,
  // decorative) ReviewLink + empty-snapshot WorkspaceApproval are created
  // here purely to satisfy required relations for this demo data — never
  // how a real approval is produced (see src/data-access/approvals.ts and
  // src/data-access/review-links.ts for the real flows).
  await prisma.reviewLink.createMany({
    data: [
      {
        id: "rl_product_pkg",
        workspaceId: productPkg.id,
        tokenHash: "seed_hash_product_pkg",
        tokenPrefix: "seedpkg1",
        expiresAt: new Date("2026-08-16T11:00:00Z"),
        createdById: arjun.id,
      },
      {
        id: "rl_ecommerce",
        workspaceId: ecommerce.id,
        tokenHash: "seed_hash_ecommerce",
        tokenPrefix: "seedecom1",
        expiresAt: new Date("2026-08-26T16:20:00Z"),
        createdById: arjun.id,
      },
    ],
  });

  await prisma.workspaceApproval.createMany({
    data: [
      {
        id: "appr_product_pkg",
        workspaceId: productPkg.id,
        reviewLinkId: "rl_product_pkg",
        approvedFileVersionSnapshot: [],
        reviewerName: "Karan Mehta",
        status: "APPROVED",
        termsAccepted: true,
        approvedAt: new Date("2026-07-17T11:00:00Z"),
      },
      {
        id: "appr_ecommerce",
        workspaceId: ecommerce.id,
        reviewLinkId: "rl_ecommerce",
        approvedFileVersionSnapshot: [],
        reviewerName: "Priya Verma",
        status: "APPROVED",
        termsAccepted: true,
        approvedAt: new Date("2026-07-27T16:20:00Z"),
      },
    ],
  });

  await prisma.payment.createMany({
    data: [
      {
        id: "pay_101",
        workspaceId: productPkg.id,
        approvalId: "appr_product_pkg",
        reviewLinkId: "rl_product_pkg",
        amount: "30000.00",
        amountSubunits: BigInt(3_000_000),
        currency: "INR",
        status: PaymentStatus.PAID,
        gateway: "razorpay",
        gatewayOrderId: "order_demo_pay_101",
        gatewayPaymentId: "pay_gw_demo_101",
        gatewaySignatureVerifiedAt: new Date("2026-07-18T15:44:00Z"),
        capturedAt: new Date("2026-07-18T15:45:00Z"),
        feeAmount: "750.00",
        paidAt: new Date("2026-07-18T15:45:00Z"),
        attemptNumber: 1,
        idempotencyKey: "seed-idem-pay-101",
        createdAt: new Date("2026-07-17T11:00:00Z"),
      },
      {
        id: "pay_102",
        workspaceId: ecommerce.id,
        approvalId: "appr_ecommerce",
        reviewLinkId: "rl_ecommerce",
        amount: "45000.00",
        amountSubunits: BigInt(4_500_000),
        currency: "INR",
        status: PaymentStatus.PENDING,
        gateway: "razorpay",
        gatewayOrderId: "order_demo_pay_102",
        attemptNumber: 1,
        idempotencyKey: "seed-idem-pay-102",
        createdAt: new Date("2026-07-27T16:25:00Z"),
      },
    ],
  });

  // Phase 7.5 — a deterministic PaymentBreakdown for the one already-PAID
  // seeded payment (pay_101), so the platform-fee-breakdown UI
  // (payment-status-card.tsx) and its E2E/visual coverage have a real,
  // non-zero breakdown to render without depending on the full
  // order-creation -> webhook capture pipeline. See
  // PLATFORM_FEE_AND_PAYOUT_LEDGER.md for the 2% (200 bps) fee.
  await prisma.paymentBreakdown.create({
    data: {
      paymentId: "pay_101",
      projectAmountSubunits: BigInt(3_000_000),
      clientChargedSubunits: BigInt(3_000_000),
      platformFeeBps: 200,
      platformFeeSubunits: BigInt(60_000),
      freelancerPayableSubunits: BigInt(2_940_000),
      currency: "INR",
      calculatedAt: new Date("2026-07-17T11:00:00Z"),
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        id: "notif_1",
        userId: arjun.id,
        workspaceId: brandIdentity.id,
        type: NotificationType.COMMENT,
        title: "New Comment on Brand Identity Design",
        message: "Rohit Sharma commented on slide 4.",
        read: false,
        createdAt: new Date("2026-07-28T08:00:00Z"),
      },
      {
        id: "notif_2",
        userId: arjun.id,
        workspaceId: ecommerce.id,
        type: NotificationType.PROJECT_APPROVED,
        title: "Work Approved by Priya Verma",
        message: "E-commerce Website UI was approved. Payment pending.",
        read: false,
        createdAt: new Date("2026-07-27T16:20:00Z"),
      },
      {
        id: "notif_3",
        userId: arjun.id,
        workspaceId: productPkg.id,
        type: NotificationType.PAYMENT_COMPLETED,
        title: "Payment Received ₹30,000",
        message: "Payment for Product Packaging Design has succeeded.",
        read: true,
        createdAt: new Date("2026-07-18T15:45:00Z"),
      },
      {
        id: "notif_4",
        userId: arjun.id,
        workspaceId: brandIdentity.id,
        type: NotificationType.SYSTEM,
        title: "Client Viewed Secure Link",
        message: "Rohit Sharma opened sec_tok_brand_identity_99",
        read: true,
        createdAt: new Date("2026-07-21T14:15:00Z"),
      },
      {
        id: "notif_5",
        userId: arjun.id,
        workspaceId: brandIdentity.id,
        type: NotificationType.CHANGES_REQUESTED,
        title: "Changes Requested on Brand Identity Design",
        message: "Rohit Sharma requested revisions on the V1 guidelines.",
        read: true,
        createdAt: new Date("2026-07-22T11:00:00Z"),
      },
      {
        id: "notif_6",
        userId: arjun.id,
        workspaceId: productPkg.id,
        type: NotificationType.FILES_DOWNLOADED,
        title: "Files Downloaded by Karan Mehta",
        message: "Original Product Packaging Design files were downloaded.",
        read: true,
        createdAt: new Date("2026-07-19T10:00:00Z"),
      },
      {
        id: "notif_7",
        userId: arjun.id,
        workspaceId: socialCampaign.id,
        type: NotificationType.PROCESSING_FAILED,
        title: "Preview Processing Failed",
        message: "Watermark preview generation failed for Social Media Campaign — retry required.",
        read: false,
        createdAt: new Date("2026-07-27T07:00:00Z"),
      },
    ],
  });

  console.log(`✓ Seeded Arjun Raj (${arjun.email}) — 4 clients, 4 workspaces, 2 payments, 7 notifications.`);
}

async function seedMeera() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const meera = await prisma.user.upsert({
    where: { email: "meera@example.com" },
    update: { name: "Meera Shah", passwordHash, role: "CREATOR" },
    create: {
      id: "usr_meera",
      name: "Meera Shah",
      email: "meera@example.com",
      passwordHash,
      role: "CREATOR",
      image:
        "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=256",
    },
  });

  await resetCreatorData(meera.id);

  const devika = await prisma.client.create({
    data: {
      id: "cli_devika",
      creatorId: meera.id,
      name: "Devika Nair",
      email: "devika@nairstudios.in",
      company: "Nair Studios",
      phone: "+91 98300 11223",
    },
  });
  const farhan = await prisma.client.create({
    data: {
      id: "cli_farhan",
      creatorId: meera.id,
      name: "Farhan Sheikh",
      email: "farhan@sheikhandco.com",
      company: "Sheikh & Co",
      phone: "+91 98300 33445",
    },
  });

  const portfolio = await prisma.workspace.create({
    data: {
      id: "ws_portfolio_refresh",
      creatorId: meera.id,
      clientId: devika.id,
      title: "Portfolio Website Refresh",
      description: "Redesigned photography portfolio with new case-study layout and dark mode.",
      currency: "INR",
      amount: "22000.00",
      status: WorkspaceStatus.IN_REVIEW,
      progress: 45,
      createdAt: new Date("2026-07-21T08:45:00Z"),
      updatedAt: new Date("2026-07-26T12:00:00Z"),
    },
  });
  const menuDesign = await prisma.workspace.create({
    data: {
      id: "ws_menu_design",
      creatorId: meera.id,
      clientId: farhan.id,
      title: "Restaurant Menu Design",
      description: "Print-ready seasonal menu design set with matching table-tent inserts.",
      currency: "INR",
      amount: "15000.00",
      status: WorkspaceStatus.PAID,
      progress: 100,
      approvedAt: new Date("2026-07-14T09:00:00Z"),
      paidAt: new Date("2026-07-15T13:30:00Z"),
      createdAt: new Date("2026-07-10T09:30:00Z"),
      updatedAt: new Date("2026-07-15T13:30:00Z"),
    },
  });

  await prisma.activityLog.createMany({
    data: [
      { workspaceId: portfolio.id, action: "Workspace Created", actorType: "CREATOR", actorName: "Meera Shah", createdAt: new Date("2026-07-21T08:45:00Z") },
      { workspaceId: portfolio.id, action: "Client Opened Review Link", actorType: "CLIENT", actorName: "Devika Nair", createdAt: new Date("2026-07-26T12:00:00Z") },
      { workspaceId: menuDesign.id, action: "Workspace Created", actorType: "CREATOR", actorName: "Meera Shah", createdAt: new Date("2026-07-10T09:30:00Z") },
      { workspaceId: menuDesign.id, action: "Payment Received (₹15,000)", actorType: "SYSTEM", actorName: "Razorpay System", createdAt: new Date("2026-07-15T13:30:00Z") },
    ],
  });

  await prisma.reviewLink.create({
    data: {
      id: "rl_menu_design",
      workspaceId: menuDesign.id,
      tokenHash: "seed_hash_menu_design",
      tokenPrefix: "seedmenu1",
      expiresAt: new Date("2026-08-13T09:00:00Z"),
      createdById: meera.id,
    },
  });

  await prisma.workspaceApproval.create({
    data: {
      id: "appr_menu_design",
      workspaceId: menuDesign.id,
      reviewLinkId: "rl_menu_design",
      approvedFileVersionSnapshot: [],
      reviewerName: "Farhan Ali",
      status: "APPROVED",
      termsAccepted: true,
      approvedAt: new Date("2026-07-14T09:00:00Z"),
    },
  });

  await prisma.payment.create({
    data: {
      id: "pay_201",
      workspaceId: menuDesign.id,
      approvalId: "appr_menu_design",
      reviewLinkId: "rl_menu_design",
      amount: "15000.00",
      amountSubunits: BigInt(1_500_000),
      currency: "INR",
      status: PaymentStatus.PAID,
      gateway: "razorpay",
      gatewayOrderId: "order_demo_pay_201",
      gatewayPaymentId: "pay_gw_demo_201",
      gatewaySignatureVerifiedAt: new Date("2026-07-15T13:29:00Z"),
      capturedAt: new Date("2026-07-15T13:30:00Z"),
      feeAmount: "375.00",
      paidAt: new Date("2026-07-15T13:30:00Z"),
      attemptNumber: 1,
      idempotencyKey: "seed-idem-pay-201",
      createdAt: new Date("2026-07-14T09:05:00Z"),
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        id: "notif_meera_1",
        userId: meera.id,
        workspaceId: portfolio.id,
        type: NotificationType.COMMENT,
        title: "New Comment on Portfolio Website Refresh",
        message: "Devika Nair left feedback on the homepage layout.",
        read: false,
        createdAt: new Date("2026-07-26T12:05:00Z"),
      },
      {
        id: "notif_meera_2",
        userId: meera.id,
        workspaceId: menuDesign.id,
        type: NotificationType.PAYMENT_COMPLETED,
        title: "Payment Received ₹15,000",
        message: "Payment for Restaurant Menu Design has succeeded.",
        read: true,
        createdAt: new Date("2026-07-15T13:30:00Z"),
      },
    ],
  });

  console.log(`✓ Seeded Meera Shah (${meera.email}) — 2 clients, 2 workspaces, 1 payment, 2 notifications.`);
}

/** Phase 7.5 — a demo ADMIN account so the /admin portal is reachable in dev/test without a manual DB edit. Has no clients/workspaces of its own. */
async function seedAdmin() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { name: "Priya Admin", passwordHash, role: "ADMIN" },
    create: {
      id: "usr_admin",
      name: "Priya Admin",
      email: "admin@example.com",
      passwordHash,
      role: "ADMIN",
      image: null,
    },
  });

  console.log(`✓ Seeded admin account (${admin.email}).`);
}

export async function main() {
  await seedArjun();
  await seedMeera();
  await seedAdmin();
}

// Only auto-run when this file is executed directly (`tsx prisma/seed.ts`,
// via `prisma db seed`) — not when its functions are imported by
// src/data-access/seed-idempotency.integration.test.ts, which needs to
// call resetCreatorData/seedArjun directly against the test database
// without triggering a second full seed run (and a `prisma.$disconnect()`
// that would break the importing test file's own prisma usage).
const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main()
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
