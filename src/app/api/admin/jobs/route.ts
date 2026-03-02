import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const jobs = await prisma.job.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      paper: { select: { title: true } },
    },
  });

  return NextResponse.json(jobs);
}
