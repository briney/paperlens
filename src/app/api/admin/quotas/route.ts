import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";

export const GET = withErrorHandler(async () => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      quota: true,
    },
  });

  return NextResponse.json(users);
});
