import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";
import { normalizeModelConfigPayload } from "@/lib/ai/model-config";

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid model ID" }, { status: 400 });
  }

  const existing = await prisma.modelConfig.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;

  const mergedPayload: Record<string, unknown> = {
    slug: existing.slug,
    displayName: existing.displayName,
    provider: existing.provider,
    deploymentName: existing.deploymentName,
    endpoint: existing.endpoint,
    apiVersion: existing.apiVersion,
    apiStyle: existing.apiStyle,
    authStyle: existing.authStyle,
    baseUrl: existing.baseUrl,
    invokePath: existing.invokePath,
    targetUri: existing.targetUri,
    extraHeaders: existing.extraHeaders,
    supportedTasks: existing.supportedTasks,
    category: existing.category,
    isDefault: existing.isDefault,
    isActive: existing.isActive,
    capabilities: existing.capabilities,
    costPerInputToken: existing.costPerInputToken,
    costPerOutputToken: existing.costPerOutputToken,
    maxTokens: existing.maxTokens,
    config: existing.config,
    ...body,
  };

  const normalized = normalizeModelConfigPayload(mergedPayload);
  if (!normalized.data) {
    return NextResponse.json({ error: normalized.error ?? "Invalid model payload" }, { status: 400 });
  }

  const updateData = normalized.data;

  if (updateData.isDefault === true) {
    const model = await prisma.$transaction(async (tx) => {
      await tx.modelConfig.updateMany({
        where: { category: updateData.category, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      return tx.modelConfig.update({ where: { id }, data: updateData });
    });

    return NextResponse.json(model);
  }

  const model = await prisma.modelConfig.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(model);
});

export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid model ID" }, { status: 400 });
  }

  await prisma.modelConfig.delete({ where: { id } });

  return NextResponse.json({ success: true });
});
