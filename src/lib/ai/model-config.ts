import type {
  ModelApiStyle,
  ModelAuthStyle,
  ModelCategory,
  Prisma,
  JobType,
} from "@prisma/client";
import { parseTaskType } from "./model-routing";

const MODEL_API_STYLES: ModelApiStyle[] = [
  "AZURE_CHAT_COMPLETIONS",
  "ANTHROPIC_MESSAGES",
  "FULL_TARGET_URI",
];

const MODEL_AUTH_STYLES: ModelAuthStyle[] = ["API_KEY", "X_API_KEY"];

const MODEL_CATEGORIES: ModelCategory[] = [
  "DOCUMENT_PARSER",
  "CHAT_COMPLETION",
  "EMBEDDING",
];

interface NormalizeResult {
  data?: Prisma.ModelConfigUncheckedCreateInput;
  error?: string;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function asJsonObject(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function asTaskTypeArray(value: unknown): JobType[] | undefined {
  if (value === undefined) return undefined;

  if (typeof value === "string") {
    const parsed = value
      .split(",")
      .map((item) => item.trim())
      .map((item) => parseTaskType(item))
      .filter((item): item is JobType => !!item);
    return parsed;
  }

  if (Array.isArray(value)) {
    const parsed = value
      .map((item) => (typeof item === "string" ? parseTaskType(item) : null))
      .filter((item): item is JobType => !!item);
    return parsed;
  }

  return undefined;
}

function defaultSupportedTasks(category: ModelCategory): JobType[] {
  if (category === "DOCUMENT_PARSER") return ["PARSE_PDF"];
  if (category === "CHAT_COMPLETION") return ["SUMMARIZE"];
  return [];
}

function normalizeApiStyle(value: unknown): ModelApiStyle | undefined {
  if (typeof value !== "string") return undefined;
  if (MODEL_API_STYLES.includes(value as ModelApiStyle)) return value as ModelApiStyle;
  return undefined;
}

function normalizeAuthStyle(
  value: unknown,
  apiStyle: ModelApiStyle
): ModelAuthStyle | undefined {
  if (typeof value === "string" && MODEL_AUTH_STYLES.includes(value as ModelAuthStyle)) {
    return value as ModelAuthStyle;
  }

  if (value === undefined) {
    return apiStyle === "ANTHROPIC_MESSAGES" ? "X_API_KEY" : "API_KEY";
  }

  return undefined;
}

function normalizeCategory(value: unknown): ModelCategory | undefined {
  if (typeof value !== "string") return undefined;
  if (MODEL_CATEGORIES.includes(value as ModelCategory)) return value as ModelCategory;
  return undefined;
}

function normalizeStringMap(value: unknown): Record<string, string> | undefined {
  const obj = asJsonObject(value);
  if (obj === undefined) return undefined;
  if (obj === null) return {};

  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") map[k] = v;
  }
  return map;
}

function normalizeRequiredString(field: string, value: unknown): { value?: string; error?: string } {
  const parsed = asTrimmedString(value);
  if (!parsed) {
    return { error: `${field} is required` };
  }
  return { value: parsed };
}

export function normalizeModelConfigPayload(body: Record<string, unknown>): NormalizeResult {
  const slugResult = normalizeRequiredString("slug", body.slug);
  if (slugResult.error) return { error: slugResult.error };

  const displayNameResult = normalizeRequiredString("displayName", body.displayName);
  if (displayNameResult.error) return { error: displayNameResult.error };

  const providerResult = normalizeRequiredString("provider", body.provider);
  if (providerResult.error) return { error: providerResult.error };

  const deploymentResult = normalizeRequiredString("deploymentName", body.deploymentName);
  if (deploymentResult.error) return { error: deploymentResult.error };

  const category = normalizeCategory(body.category);
  if (!category) return { error: "category is required" };

  const apiStyle = normalizeApiStyle(body.apiStyle) ?? "AZURE_CHAT_COMPLETIONS";
  const authStyle = normalizeAuthStyle(body.authStyle, apiStyle);
  if (!authStyle) return { error: "authStyle is invalid" };

  const apiVersion = asTrimmedString(body.apiVersion);
  const baseUrl = asTrimmedString(body.baseUrl) ?? asTrimmedString(body.endpoint);
  const invokePath = asTrimmedString(body.invokePath);
  const targetUri = asTrimmedString(body.targetUri);

  if (apiStyle === "AZURE_CHAT_COMPLETIONS") {
    if (!baseUrl) return { error: "baseUrl is required for AZURE_CHAT_COMPLETIONS" };
    if (!apiVersion) return { error: "apiVersion is required for AZURE_CHAT_COMPLETIONS" };
  }

  if (apiStyle === "ANTHROPIC_MESSAGES" && !baseUrl) {
    return { error: "baseUrl is required for ANTHROPIC_MESSAGES" };
  }

  if (apiStyle === "FULL_TARGET_URI" && !targetUri) {
    return { error: "targetUri is required for FULL_TARGET_URI" };
  }

  const supportedTasks = asTaskTypeArray(body.supportedTasks) ?? defaultSupportedTasks(category);
  const fallbackEndpoint = baseUrl ?? targetUri;
  if (!fallbackEndpoint) {
    return { error: "Either baseUrl or targetUri is required" };
  }

  const extraHeaders = normalizeStringMap(body.extraHeaders);
  if (body.extraHeaders !== undefined && extraHeaders === undefined) {
    return { error: "extraHeaders must be a JSON object" };
  }

  const capabilities = asJsonObject(body.capabilities);
  if (body.capabilities !== undefined && capabilities === undefined) {
    return { error: "capabilities must be a JSON object" };
  }

  const config = asJsonObject(body.config);
  if (body.config !== undefined && config === undefined) {
    return { error: "config must be a JSON object" };
  }

  const isDefault = asBoolean(body.isDefault) ?? false;
  const isActive = asBoolean(body.isActive) ?? true;
  const maxTokens = asNumber(body.maxTokens) ?? 4096;
  const costPerInputToken = asNumber(body.costPerInputToken) ?? 0;
  const costPerOutputToken = asNumber(body.costPerOutputToken) ?? 0;

  return {
    data: {
      slug: slugResult.value!,
      displayName: displayNameResult.value!,
      provider: providerResult.value!,
      deploymentName: deploymentResult.value!,
      endpoint: fallbackEndpoint,
      apiVersion: apiVersion ?? null,
      apiStyle,
      authStyle,
      baseUrl: baseUrl ?? null,
      invokePath: invokePath ?? null,
      targetUri: targetUri ?? null,
      extraHeaders: (extraHeaders as Prisma.InputJsonValue | undefined) ?? undefined,
      supportedTasks,
      category,
      isDefault,
      isActive,
      capabilities: (capabilities as Prisma.InputJsonValue | undefined) ?? undefined,
      costPerInputToken,
      costPerOutputToken,
      maxTokens,
      config: (config as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  };
}
