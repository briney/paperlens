import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";

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

  const updated = await prisma.job.update({
    where: { id },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  return NextResponse.json(updated);
});
