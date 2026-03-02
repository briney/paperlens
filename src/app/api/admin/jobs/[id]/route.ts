import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;

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
}
