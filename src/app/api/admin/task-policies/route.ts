import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import {
  ModelRoutingError,
  parseTaskType,
  isModelCompatibleWithTask,
  resolveSpecificModelForTask,
} from "@/lib/ai/model-routing";

const MAX_SYSTEM_PROMPT_LENGTH = 20_000;

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

function parseSystemPromptOverride(value: unknown): {
  value: string | null | undefined;
  error?: string;
} {
  if (value === undefined) return { value: undefined };
  if (value === null) return { value: null };
  if (typeof value !== "string") {
    return { value: undefined, error: "systemPromptOverride must be a string or null" };
  }

  if (value.trim().length === 0) {
    return { value: null };
  }

  if (value.length > MAX_SYSTEM_PROMPT_LENGTH) {
    return { value: undefined, error: `systemPromptOverride must be <= ${MAX_SYSTEM_PROMPT_LENGTH} characters` };
  }

  return { value };
}

function parseOptionalModelSlug(value: unknown): {
  value: string | null | undefined;
  error?: string;
} {
  if (value === undefined) return { value: undefined };
  if (value === null) return { value: null };
  if (typeof value !== "string") {
    return { value: undefined, error: "postOcrNormalizationModelSlug must be a string or null" };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: null };
  }

  return { value: trimmed };
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
      postOcrNormalizationModel: {
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
  const prompt = parseSystemPromptOverride(body.systemPromptOverride);
  const postOcrModel = parseOptionalModelSlug(body.postOcrNormalizationModelSlug);

  if (body.constraints !== undefined && constraints === undefined) {
    return NextResponse.json({ error: "constraints must be an object of booleans" }, { status: 400 });
  }
  if (prompt.error) {
    return NextResponse.json({ error: prompt.error }, { status: 400 });
  }
  if (postOcrModel.error) {
    return NextResponse.json({ error: postOcrModel.error }, { status: 400 });
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

  const systemPromptOverride = prompt.value ?? null;

  const requestedPostOcrModelSlug = postOcrModel.value ?? null;
  if (taskType !== "PARSE_PDF" && requestedPostOcrModelSlug) {
    return NextResponse.json(
      { error: "postOcrNormalizationModelSlug is only supported for PARSE_PDF" },
      { status: 400 }
    );
  }

  const postOcrNormalizationModelSlug = taskType === "PARSE_PDF"
    ? requestedPostOcrModelSlug
    : null;

  if (postOcrNormalizationModelSlug) {
    try {
      await resolveSpecificModelForTask({
        taskType: "SUMMARIZE",
        modelSlug: postOcrNormalizationModelSlug,
      });
    } catch (error) {
      if (error instanceof ModelRoutingError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      throw error;
    }
  }

  const policy = await prisma.taskModelPolicy.upsert({
    where: { taskType },
    update: {
      defaultModelSlug: defaultModelSlug ?? null,
      systemPromptOverride,
      postOcrNormalizationModelSlug,
      allowUserOverride,
      fallbackModelSlugs,
      constraints: constraints ?? undefined,
    },
    create: {
      taskType,
      defaultModelSlug: defaultModelSlug ?? null,
      systemPromptOverride,
      postOcrNormalizationModelSlug,
      allowUserOverride,
      fallbackModelSlugs,
      constraints: constraints ?? undefined,
    },
  });

  return NextResponse.json(policy, { status: 201 });
});
