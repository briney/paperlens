import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: { select: { papers: true, jobs: true } },
      quota: { select: { tier: true } },
    },
  });

  return NextResponse.json(users);
}
