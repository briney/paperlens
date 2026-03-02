import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { userId } = await params;
  const body = await request.json();

  const { tier, maxPapersPerDay, maxPapersPerMonth, maxTokensPerMonth } = body;

  const quota = await prisma.userQuota.upsert({
    where: { userId },
    create: {
      userId,
      tier: tier ?? "FREE",
      maxPapersPerDay: maxPapersPerDay ?? 10,
      maxPapersPerMonth: maxPapersPerMonth ?? 100,
      maxTokensPerMonth: maxTokensPerMonth ?? 1_000_000,
    },
    update: {
      ...(tier !== undefined && { tier }),
      ...(maxPapersPerDay !== undefined && { maxPapersPerDay }),
      ...(maxPapersPerMonth !== undefined && { maxPapersPerMonth }),
      ...(maxTokensPerMonth !== undefined && { maxTokensPerMonth }),
    },
  });

  return NextResponse.json(quota);
}
