import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";

function parseLimit(value: string | null): number {
  if (!value) return 100;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(parsed, 200));
}

export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  const jobs = await prisma.job.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      isArchivedByAdmin: true,
      error: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      paper: {
        select: {
          id: true,
          title: true,
        },
      },
      analysis: {
        select: {
          id: true,
          type: true,
        },
      },
    },
  });

  return NextResponse.json({ jobs });
});
