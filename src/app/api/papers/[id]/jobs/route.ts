import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";

export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid paper ID" }, { status: 400 });
  }

  // Verify paper belongs to user
  const paper = await prisma.paper.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  const jobs = await prisma.job.findMany({
    where: { paperId: id, isArchivedByAdmin: false },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ jobs });
});
