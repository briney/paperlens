import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { normalizeModelConfigPayload } from "@/lib/ai/model-config";

export const GET = withErrorHandler(async () => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const models = await prisma.modelConfig.findMany({
    orderBy: [{ category: "asc" }, { displayName: "asc" }],
  });

  return NextResponse.json(models);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const body = (await request.json()) as Record<string, unknown>;
  const normalized = normalizeModelConfigPayload(body);

  if (!normalized.data) {
    return NextResponse.json({ error: normalized.error ?? "Invalid model payload" }, { status: 400 });
  }

  if (normalized.data.isDefault) {
    await prisma.modelConfig.updateMany({
      where: { category: normalized.data.category, isDefault: true },
      data: { isDefault: false },
    });
  }

  const model = await prisma.modelConfig.create({
    data: normalized.data,
  });

  return NextResponse.json(model, { status: 201 });
});
