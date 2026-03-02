import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-utils";

export const GET = withErrorHandler(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const models = await prisma.modelConfig.findMany({
    where: { category: "CHAT_COMPLETION", isActive: true },
    select: {
      slug: true,
      displayName: true,
      isDefault: true,
      capabilities: true,
    },
    orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
  });

  return NextResponse.json({ models });
});
