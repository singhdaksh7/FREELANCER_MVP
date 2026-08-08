import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/data-access/auth";
import { prisma } from "@/lib/prisma";
import { logUploadTiming } from "@/lib/upload-timing";

const bodySchema = z.object({ stage: z.enum(["browser_upload_finished", "ui_ready_observed"]), fileId: z.string().cuid().optional() });

/** Authenticated, write-only telemetry endpoint. It returns no timing data or session details. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const creator = await requireAuthenticatedUser();
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid timing event." }, { status: 400 });
  const session = await prisma.uploadSession.findFirst({ where: { id: sessionId, creatorId: creator.id }, select: { timingCorrelationId: true } });
  if (!session) return NextResponse.json({ error: "Not found." }, { status: 404 });
  logUploadTiming({ correlationId: session.timingCorrelationId, stage: body.data.stage, fileId: body.data.fileId });
  return new NextResponse(null, { status: 204 });
}
