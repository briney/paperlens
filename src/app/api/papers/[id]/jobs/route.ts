import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify paper belongs to user
  const paper = await prisma.paper.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  const jobs = await prisma.job.findMany({
    where: { paperId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ jobs });
}
