import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";
import { paperQueue } from "@/lib/queue";

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id, jobId } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }
  if (typeof jobId !== "string" || !isValidCuid(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  let body: { isArchivedByAdmin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.isArchivedByAdmin !== "boolean") {
    return NextResponse.json(
      { error: "isArchivedByAdmin must be a boolean" },
      { status: 400 }
    );
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId: id },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: body.isArchivedByAdmin
      ? {
          isArchivedByAdmin: true,
          archivedAt: new Date(),
          archivedById: check.user.id,
        }
      : {
          isArchivedByAdmin: false,
          archivedAt: null,
          archivedById: null,
        },
    select: {
      id: true,
      isArchivedByAdmin: true,
      archivedAt: true,
      archivedById: true,
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id, jobId } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }
  if (typeof jobId !== "string" || !isValidCuid(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId: id },
    select: { id: true, status: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "PROCESSING") {
    return NextResponse.json(
      { error: "Cannot delete a PROCESSING job. Cancel it first." },
      { status: 400 }
    );
  }

  if (job.status === "QUEUED") {
    const queueJob = await paperQueue.getJob(jobId);
    if (queueJob) {
      try {
        await queueJob.discard();
        await queueJob.remove();
      } catch (error) {
        console.warn(`Failed to remove queued job ${jobId}:`, error);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.analysis.deleteMany({ where: { jobId } });
    await tx.job.delete({ where: { id: jobId } });
  });

  return NextResponse.json({ success: true });
});
