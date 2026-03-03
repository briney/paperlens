import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";

const VALID_TIERS = new Set(["FREE", "PRO", "ADMIN"]);

export const PUT = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { userId } = await params;
  if (typeof userId !== "string" || !isValidCuid(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const body = await request.json();

  const { tier, maxPapersPerDay, maxPapersPerMonth, maxTokensPerMonth } = body;
  if (tier !== undefined && (typeof tier !== "string" || !VALID_TIERS.has(tier))) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

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
});
