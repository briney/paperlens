import { prisma } from "@/lib/db";
import type {
  JobType,
  ModelCategory,
  ModelConfig,
  ModelApiStyle,
  ModelAuthStyle,
  TaskModelPolicy,
} from "@prisma/client";

export class ModelRoutingError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ModelRoutingError";
    this.code = code;
    this.status = status;
  }
}

export interface ModelInvocationConfig {
  apiStyle: ModelApiStyle;
  authStyle: ModelAuthStyle;
  deploymentName: string;
  apiVersion?: string;
  baseUrl?: string;
  invokePath?: string;
  targetUri?: string;
  extraHeaders?: Record<string, string>;
}

interface ResolveTaskModelArgs {
  taskType: JobType;
  requestedModelSlug?: string;
}

interface CompatibleTaskModel {
  slug: string;
  displayName: string;
  isDefault: boolean;
  capabilities: Record<string, unknown> | null;
}

const LEGACY_CATEGORY_BY_TASK: Partial<Record<JobType, ModelCategory>> = {
  PARSE_PDF: "DOCUMENT_PARSER",
  SUMMARIZE: "CHAT_COMPLETION",
  PEER_REVIEW: "CHAT_COMPLETION",
  CLAIM_VERIFY: "CHAT_COMPLETION",
  JOURNAL_CLUB: "CHAT_COMPLETION",
  NOVELTY_ASSESS: "CHAT_COMPLETION",
  CUSTOM: "CHAT_COMPLETION",
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") {
      map[k] = v;
    }
  }
  return map;
}

function asBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const map: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "boolean") {
      map[k] = v;
    }
  }
  return map;
}

function supportedTasksFromCategory(category: ModelCategory): JobType[] {
  switch (category) {
    case "DOCUMENT_PARSER":
      return ["PARSE_PDF"];
    case "CHAT_COMPLETION":
      return ["SUMMARIZE"];
    default:
      return [];
  }
}

function getSupportedTasks(model: Pick<ModelConfig, "supportedTasks" | "category">): JobType[] {
  const explicit = asStringArray(model.supportedTasks)
    .filter((task): task is JobType => isJobType(task));

  if (explicit.length > 0) return explicit;
  return supportedTasksFromCategory(model.category);
}

function getConstraints(policy: Pick<TaskModelPolicy, "constraints"> | null): Record<string, boolean> {
  if (!policy) return {};
  return asBooleanMap(policy.constraints);
}

function getFallbackModelSlugs(policy: Pick<TaskModelPolicy, "fallbackModelSlugs"> | null): string[] {
  if (!policy) return [];
  return asStringArray(policy.fallbackModelSlugs);
}

function isJobType(value: string): value is JobType {
  return [
    "PARSE_PDF",
    "SUMMARIZE",
    "PEER_REVIEW",
    "CLAIM_VERIFY",
    "JOURNAL_CLUB",
    "NOVELTY_ASSESS",
    "CUSTOM",
  ].includes(value);
}

export function isModelCompatibleWithTask(
  model: Pick<ModelConfig, "supportedTasks" | "category" | "capabilities">,
  taskType: JobType,
  constraints?: Record<string, boolean>
): boolean {
  const supportedTasks = getSupportedTasks(model);
  if (!supportedTasks.includes(taskType)) return false;

  if (!constraints || Object.keys(constraints).length === 0) return true;

  const capabilities = asBooleanMap(model.capabilities);
  for (const [key, expected] of Object.entries(constraints)) {
    if ((capabilities[key] ?? false) !== expected) return false;
  }

  return true;
}

function normalizeInvocationConfig(model: ModelConfig): ModelInvocationConfig {
  return {
    apiStyle: model.apiStyle,
    authStyle: model.authStyle,
    deploymentName: model.deploymentName,
    apiVersion: model.apiVersion ?? undefined,
    baseUrl: model.baseUrl ?? undefined,
    invokePath: model.invokePath ?? undefined,
    targetUri: model.targetUri ?? undefined,
    extraHeaders: asStringMap(model.extraHeaders),
  };
}

async function getTaskPolicy(taskType: JobType) {
  return prisma.taskModelPolicy.findUnique({
    where: { taskType },
    include: { defaultModel: true },
  });
}

async function getLegacyDefaultModel(taskType: JobType) {
  const category = LEGACY_CATEGORY_BY_TASK[taskType];
  if (!category) return null;

  return prisma.modelConfig.findFirst({
    where: {
      category,
      isDefault: true,
      isActive: true,
    },
  });
}

export async function resolveTaskModel(
  args: ResolveTaskModelArgs
): Promise<{ model: ModelConfig; policy: TaskModelPolicy | null }> {
  const { taskType, requestedModelSlug } = args;
  const policy = await getTaskPolicy(taskType);
  const constraints = getConstraints(policy);

  if (requestedModelSlug) {
    const requested = await prisma.modelConfig.findUnique({
      where: { slug: requestedModelSlug },
    });

    if (!requested || !requested.isActive) {
      throw new ModelRoutingError(
        "MODEL_NOT_FOUND",
        `Model \"${requestedModelSlug}\" is missing or inactive.`,
        404
      );
    }

    if (
      policy &&
      policy.allowUserOverride === false &&
      requested.slug !== policy.defaultModelSlug
    ) {
      throw new ModelRoutingError(
        "MODEL_OVERRIDE_DISABLED",
        `Task ${taskType} does not allow model overrides.`
      );
    }

    if (!isModelCompatibleWithTask(requested, taskType, constraints)) {
      throw new ModelRoutingError(
        "MODEL_NOT_COMPATIBLE_WITH_TASK",
        `Model \"${requested.slug}\" does not support task ${taskType}.`
      );
    }

    return { model: requested, policy };
  }

  if (policy?.defaultModel && policy.defaultModel.isActive) {
    if (isModelCompatibleWithTask(policy.defaultModel, taskType, constraints)) {
      return { model: policy.defaultModel, policy };
    }
  }

  const fallbackSlugs = getFallbackModelSlugs(policy);
  if (fallbackSlugs.length > 0) {
    const fallbackModels = await prisma.modelConfig.findMany({
      where: { slug: { in: fallbackSlugs }, isActive: true },
    });

    for (const slug of fallbackSlugs) {
      const candidate = fallbackModels.find((m) => m.slug === slug);
      if (!candidate) continue;
      if (isModelCompatibleWithTask(candidate, taskType, constraints)) {
        return { model: candidate, policy };
      }
    }
  }

  const legacyDefault = await getLegacyDefaultModel(taskType);
  if (legacyDefault && isModelCompatibleWithTask(legacyDefault, taskType, constraints)) {
    return { model: legacyDefault, policy };
  }

  const allActive = await prisma.modelConfig.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
  });

  const firstCompatible = allActive.find((model) =>
    isModelCompatibleWithTask(model, taskType, constraints)
  );

  if (firstCompatible) {
    return { model: firstCompatible, policy };
  }

  throw new ModelRoutingError(
    "TASK_DEFAULT_MODEL_MISSING",
    `No active model is configured for task ${taskType}.`,
    500
  );
}

export async function resolveInvocationForTask(args: ResolveTaskModelArgs): Promise<{
  model: ModelConfig;
  policy: TaskModelPolicy | null;
  invocation: ModelInvocationConfig;
}> {
  const { model, policy } = await resolveTaskModel(args);
  return {
    model,
    policy,
    invocation: normalizeInvocationConfig(model),
  };
}

export async function listCompatibleModelsForTask(
  taskType: JobType
): Promise<CompatibleTaskModel[]> {
  const policy = await getTaskPolicy(taskType);
  const constraints = getConstraints(policy);

  const models = await prisma.modelConfig.findMany({
    where: { isActive: true },
    select: {
      slug: true,
      displayName: true,
      category: true,
      supportedTasks: true,
      capabilities: true,
      isDefault: true,
    },
    orderBy: [{ displayName: "asc" }],
  });

  const legacyDefault = policy?.defaultModelSlug
    ? null
    : (await getLegacyDefaultModel(taskType))?.slug;
  const taskDefaultSlug = policy?.defaultModelSlug ?? legacyDefault ?? null;
  const compatible = models
    .filter((model) => isModelCompatibleWithTask(model, taskType, constraints))
    .map((model) => ({
      slug: model.slug,
      displayName: model.displayName,
      isDefault: model.slug === taskDefaultSlug,
      capabilities: (model.capabilities as Record<string, unknown> | null) ?? null,
    }));

  if (policy && policy.allowUserOverride === false && taskDefaultSlug) {
    const defaultOnly = compatible.find((model) => model.slug === taskDefaultSlug);
    return defaultOnly ? [defaultOnly] : [];
  }

  return compatible;
}

export function parseTaskType(value: string | null | undefined): JobType | null {
  if (!value) return null;
  if (!isJobType(value)) return null;
  return value;
}

export function parseSupportedTasks(value: unknown): JobType[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JobType => typeof item === "string" && isJobType(item));
  }

  if (typeof value === "string") {
    const parsed = value
      .split(",")
      .map((task) => task.trim())
      .filter((task): task is JobType => isJobType(task));

    return parsed;
  }

  return [];
}
