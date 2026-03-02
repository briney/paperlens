import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";

export const GET = withErrorHandler(async () => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    userCount,
    paperCount,
    activeModelCount,
    jobsByStatus,
    todayUsage,
    monthUsage,
    recentJobs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.paper.count(),
    prisma.modelConfig.count({ where: { isActive: true } }),
    prisma.job.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.usageRecord.aggregate({
      where: { createdAt: { gte: startOfDay } },
      _sum: { inputTokens: true, outputTokens: true, cost: true },
    }),
    prisma.usageRecord.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { inputTokens: true, outputTokens: true, cost: true },
    }),
    prisma.job.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        paper: { select: { title: true } },
      },
    }),
  ]);

  const jobCounts: Record<string, number> = {};
  for (const row of jobsByStatus) {
    jobCounts[row.status] = row._count.id;
  }

  return NextResponse.json({
    users: userCount,
    papers: paperCount,
    activeModels: activeModelCount,
    jobs: jobCounts,
    tokensToday: (todayUsage._sum.inputTokens ?? 0) + (todayUsage._sum.outputTokens ?? 0),
    costThisMonth: monthUsage._sum.cost ?? 0,
    recentJobs,
  });
});
