import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";

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

  const body = await request.json();

  const {
    slug,
    displayName,
    provider,
    deploymentName,
    endpoint,
    apiVersion,
    category,
    isDefault,
    isActive,
    capabilities,
    costPerInputToken,
    costPerOutputToken,
    maxTokens,
    config,
  } = body;

  if (!slug || !displayName || !provider || !deploymentName || !endpoint || !apiVersion || !category) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // If setting as default, unset others in same category
  if (isDefault) {
    await prisma.modelConfig.updateMany({
      where: { category, isDefault: true },
      data: { isDefault: false },
    });
  }

  const model = await prisma.modelConfig.create({
    data: {
      slug,
      displayName,
      provider,
      deploymentName,
      endpoint,
      apiVersion,
      category,
      isDefault: isDefault ?? false,
      isActive: isActive ?? true,
      capabilities: capabilities ?? null,
      costPerInputToken: costPerInputToken ?? 0,
      costPerOutputToken: costPerOutputToken ?? 0,
      maxTokens: maxTokens ?? 4096,
      config: config ?? null,
    },
  });

  return NextResponse.json(model, { status: 201 });
});
