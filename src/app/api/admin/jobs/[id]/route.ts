import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";
import { paperQueue } from "@/lib/queue";

export const PATCH = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "QUEUED" && job.status !== "PROCESSING") {
    return NextResponse.json(
      { error: "Can only cancel QUEUED or PROCESSING jobs" },
      { status: 400 }
    );
  }

  const cancelResult = await prisma.job.updateMany({
    where: {
      id,
      status: { in: ["QUEUED", "PROCESSING"] },
    },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  if (cancelResult.count === 0) {
    const latest = await prisma.job.findUnique({ where: { id } });
    return NextResponse.json(
      {
        error: `Cannot cancel job in ${latest?.status ?? "unknown"} state`,
      },
      { status: 409 }
    );
  }

  const queueJob = await paperQueue.getJob(id);
  if (queueJob) {
    try {
      await queueJob.discard();
      await queueJob.remove();
    } catch (error) {
      console.warn(`Failed to remove queued job ${id}:`, error);
    }
  }

  const updated = await prisma.job.findUniqueOrThrow({ where: { id } });
  return NextResponse.json(updated);
});
