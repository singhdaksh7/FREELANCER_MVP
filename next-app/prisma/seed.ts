import "dotenv/config";
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

async function resetCreatorData(creatorId: string) {
  // Order matters: Workspace -> Client uses onDelete: Restrict, so
  // workspaces (and everything cascading from them) must go first.
  await prisma.notification.deleteMany({ where: { userId: creatorId } });
  await prisma.workspace.deleteMany({ where: { creatorId } });
  await prisma.client.deleteMany({ where: { creatorId } });
}

async function seedArjun() {
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

  await prisma.payment.createMany({
    data: [
      {
        id: "pay_101",
        workspaceId: productPkg.id,
        amount: "30000.00",
        currency: "INR",
        status: PaymentStatus.PAID,
        gateway: "razorpay",
        gatewayOrderId: "order_demo_pay_101",
        gatewayPaymentId: "pay_gw_demo_101",
        feeAmount: "750.00",
        paidAt: new Date("2026-07-18T15:45:00Z"),
        createdAt: new Date("2026-07-17T11:00:00Z"),
      },
      {
        id: "pay_102",
        workspaceId: ecommerce.id,
        amount: "45000.00",
        currency: "INR",
        status: PaymentStatus.PENDING,
        gateway: "razorpay",
        gatewayOrderId: "order_demo_pay_102",
        createdAt: new Date("2026-07-27T16:25:00Z"),
      },
      {
        id: "pay_103",
        workspaceId: brandIdentity.id,
        amount: "25000.00",
        currency: "INR",
        status: PaymentStatus.CREATED,
        gateway: "razorpay",
        createdAt: new Date("2026-07-20T10:36:00Z"),
      },
    ],
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

  console.log(`✓ Seeded Arjun Raj (${arjun.email}) — 4 clients, 4 workspaces, 3 payments, 7 notifications.`);
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

  await prisma.payment.create({
    data: {
      id: "pay_201",
      workspaceId: menuDesign.id,
      amount: "15000.00",
      currency: "INR",
      status: PaymentStatus.PAID,
      gateway: "razorpay",
      gatewayOrderId: "order_demo_pay_201",
      gatewayPaymentId: "pay_gw_demo_201",
      feeAmount: "375.00",
      paidAt: new Date("2026-07-15T13:30:00Z"),
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

async function main() {
  await seedArjun();
  await seedMeera();
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
