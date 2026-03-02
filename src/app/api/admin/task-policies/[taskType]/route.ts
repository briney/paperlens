import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { parseTaskType, isModelCompatibleWithTask } from "@/lib/ai/model-routing";

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

export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const raw = (await params).taskType;
  const taskType = parseTaskType(typeof raw === "string" ? raw : null);
  if (!taskType) {
    return NextResponse.json({ error: "Invalid task type" }, { status: 400 });
  }

  const policy = await prisma.taskModelPolicy.findUnique({
    where: { taskType },
    include: {
      defaultModel: {
        select: {
          slug: true,
          displayName: true,
          isActive: true,
        },
      },
    },
  });

  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  return NextResponse.json(policy);
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const raw = (await params).taskType;
  const taskType = parseTaskType(typeof raw === "string" ? raw : null);
  if (!taskType) {
    return NextResponse.json({ error: "Invalid task type" }, { status: 400 });
  }

  const existing = await prisma.taskModelPolicy.findUnique({ where: { taskType } });
  if (!existing) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;

  const defaultModelSlug = body.defaultModelSlug !== undefined
    ? toOptionalString(body.defaultModelSlug)
    : existing.defaultModelSlug ?? undefined;

  const allowUserOverride =
    typeof body.allowUserOverride === "boolean"
      ? body.allowUserOverride
      : existing.allowUserOverride;

  const fallbackModelSlugs =
    body.fallbackModelSlugs !== undefined
      ? parseStringArray(body.fallbackModelSlugs)
      : parseStringArray(existing.fallbackModelSlugs);

  const constraints =
    body.constraints !== undefined
      ? parseBooleanMap(body.constraints)
      : parseBooleanMap(existing.constraints);

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

  const policy = await prisma.taskModelPolicy.update({
    where: { taskType },
    data: {
      defaultModelSlug: defaultModelSlug ?? null,
      allowUserOverride,
      fallbackModelSlugs,
      constraints: constraints ?? undefined,
    },
  });

  return NextResponse.json(policy);
});

export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const raw = (await params).taskType;
  const taskType = parseTaskType(typeof raw === "string" ? raw : null);
  if (!taskType) {
    return NextResponse.json({ error: "Invalid task type" }, { status: 400 });
  }

  await prisma.taskModelPolicy.delete({ where: { taskType } });

  return NextResponse.json({ success: true });
});
