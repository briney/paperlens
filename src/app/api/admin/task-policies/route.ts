import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import {
  parseTaskType,
  isModelCompatibleWithTask,
} from "@/lib/ai/model-routing";

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function parseBooleanMap(value: unknown): Record<string, boolean> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const map: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "boolean") {
      map[k] = v;
    }
  }
  return map;
}

export const GET = withErrorHandler(async () => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const policies = await prisma.taskModelPolicy.findMany({
    include: {
      defaultModel: {
        select: {
          slug: true,
          displayName: true,
          isActive: true,
        },
      },
    },
    orderBy: { taskType: "asc" },
  });

  return NextResponse.json({ policies });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const body = (await request.json()) as Record<string, unknown>;

  const taskType = parseTaskType(typeof body.taskType === "string" ? body.taskType : null);
  if (!taskType) {
    return NextResponse.json({ error: "taskType is required" }, { status: 400 });
  }

  const defaultModelSlug = toOptionalString(body.defaultModelSlug);
  const allowUserOverride = typeof body.allowUserOverride === "boolean" ? body.allowUserOverride : true;
  const fallbackModelSlugs = parseStringArray(body.fallbackModelSlugs);
  const constraints = parseBooleanMap(body.constraints);

  if (body.constraints !== undefined && constraints === undefined) {
    return NextResponse.json({ error: "constraints must be an object of booleans" }, { status: 400 });
  }

  if (defaultModelSlug) {
    const defaultModel = await prisma.modelConfig.findUnique({ where: { slug: defaultModelSlug } });
    if (!defaultModel || !defaultModel.isActive) {
      return NextResponse.json({ error: "defaultModelSlug is missing or inactive" }, { status: 400 });
    }

    if (!isModelCompatibleWithTask(defaultModel, taskType, constraints ?? {})) {
      return NextResponse.json({ error: "defaultModelSlug is not compatible with task constraints" }, { status: 400 });
    }
  }

  const policy = await prisma.taskModelPolicy.upsert({
    where: { taskType },
    update: {
      defaultModelSlug: defaultModelSlug ?? null,
      allowUserOverride,
      fallbackModelSlugs,
      constraints: constraints ?? undefined,
    },
    create: {
      taskType,
      defaultModelSlug: defaultModelSlug ?? null,
      allowUserOverride,
      fallbackModelSlugs,
      constraints: constraints ?? undefined,
    },
  });

  return NextResponse.json(policy, { status: 201 });
});
