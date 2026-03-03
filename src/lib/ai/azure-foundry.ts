import type { JobType } from "@prisma/client";
import {
  resolveInvocationForTask,
  resolveInvocationForSpecificModel,
  ModelRoutingError,
  type ModelInvocationConfig,
} from "./model-routing";
import { sanitizeProviderErrorText } from "./error-sanitizer";
import { getBuiltInTaskPrompt, resolveTaskPrompt } from "./task-prompts";
import type {
  AIProvider,
  Message,
  ParseOptions,
  ParseResult,
  CompletionOptions,
  CompletionResult,
  TokenUsage,
} from "./types";

interface AzureFoundryConfig {
  apiKey: string;
  fallbackEndpoint?: string;
  fallbackApiVersion?: string;
  parserDeployment?: string;
  completionDeployment?: string;
}

interface InvocationSelection {
  invocation: ModelInvocationConfig;
  modelName: string;
}

const PARSE_USER_PROMPT =
  "Parse this scientific paper and output it as structured markdown with YAML front matter metadata.";

const POST_OCR_NORMALIZATION_USER_PROMPT = `Reformat the OCR output below into clean markdown using the required structure from the system instructions.

Requirements:
- Preserve all scientific content, including equations, tables, references, and section ordering.
- Correct obvious OCR artifacts when confidence is high.
- Do not invent content.
- Keep the output concise and machine-parseable markdown.

OCR content starts below:
`;

function mergeUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export function buildChatParseBody(
  modelName: string,
  base64Pdf: string,
  systemPrompt: string
): Record<string, unknown> {
  return {
    model: modelName,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "document_url",
            document_url: {
              url: `data:application/pdf;base64,${base64Pdf}`,
            },
          },
          {
            type: "text",
            text: PARSE_USER_PROMPT,
          },
        ],
      },
    ],
  };
}

export function buildImageToTextParseBody(
  modelName: string,
  base64Pdf: string
): Record<string, unknown> {
  return {
    model: modelName,
    document: {
      type: "document_url",
      document_url: `data:application/pdf;base64,${base64Pdf}`,
    },
  };
}

export function extractImageToTextContent(data: Record<string, unknown>): string {
  if (typeof data.markdown === "string") {
    return data.markdown.trim();
  }

  const pages = data.pages;
  if (!Array.isArray(pages)) return "";

  return pages
    .map((page) => {
      if (!page || typeof page !== "object") return "";
      const markdown = (page as { markdown?: unknown }).markdown;
      if (typeof markdown === "string") return markdown;
      const text = (page as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter((part) => part.length > 0)
    .join("\n\n")
    .trim();
}

export function shouldUseImageToTextForParse(invocation: ModelInvocationConfig): boolean {
  if (invocation.apiStyle === "AZURE_IMAGE_TO_TEXT") return true;

  const invokePath = invocation.invokePath?.toLowerCase() ?? "";
  if (!invokePath) return false;

  return invokePath.includes("/v1/ocr")
    || invokePath.endsWith("/ocr")
    || invokePath.includes("/ocr?");
}

export function shouldRetryParseWithImageToText(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("\"loc\":[\"body\",\"document\"]")
    || (message.includes("field required") && message.includes("document"))
    || (message.includes("missing") && message.includes("\"document\""))
  );
}

export class AzureFoundryProvider implements AIProvider {
  private apiKey: string;
  private fallbackEndpoint?: string;
  private fallbackApiVersion?: string;
  private parserDeployment: string;
  private completionDeployment: string;

  constructor(config: AzureFoundryConfig) {
    this.apiKey = config.apiKey;
    this.fallbackEndpoint = config.fallbackEndpoint?.replace(/\/$/, "");
    this.fallbackApiVersion = config.fallbackApiVersion;
    this.parserDeployment = config.parserDeployment ?? "mistral-document-ai-2512";
    this.completionDeployment = config.completionDeployment ?? "gpt-4o";
  }

  async parseDocument(
    pdfBuffer: Buffer,
    options?: ParseOptions
  ): Promise<ParseResult> {
    const taskType = options?.taskType ?? "PARSE_PDF";
    const invocation = await this.resolveInvocation(taskType, options?.modelSlug);

    if (invocation.invocation.apiStyle === "ANTHROPIC_MESSAGES") {
      throw new Error(
        `Model ${invocation.modelName} uses anthropic_messages, which is not supported for PDF parsing.`
      );
    }

    const promptConfig = await resolveTaskPrompt("PARSE_PDF");
    const parseSystemPrompt = promptConfig.prompt ?? getBuiltInTaskPrompt("PARSE_PDF");
    if (!parseSystemPrompt) {
      throw new Error("No system prompt is configured for PARSE_PDF.");
    }

    const base64Pdf = pdfBuffer.toString("base64");
    let content = "";
    let usage: TokenUsage;
    let normalizationFailed = false;

    const imageToTextPreferred = shouldUseImageToTextForParse(invocation.invocation);
    if (imageToTextPreferred) {
      const ocrResult = await this.parseWithImageToText({
        invocation: invocation.invocation,
        modelName: invocation.modelName,
        base64Pdf,
        parseSystemPrompt,
        preferredNormalizationModelSlug: promptConfig.postOcrNormalizationModelSlug,
      });
      content = ocrResult.content;
      usage = ocrResult.usage;
      normalizationFailed = ocrResult.normalizationFailed;
    } else {
      try {
        const body = buildChatParseBody(invocation.modelName, base64Pdf, parseSystemPrompt);
        const data = await this.sendOpenAIChatCompletion(invocation.invocation, body, "parse");
        content = this.extractOpenAIContent(data);
        usage = this.extractUsage(data);
      } catch (error) {
        if (!shouldRetryParseWithImageToText(error)) {
          throw error;
        }

        const ocrResult = await this.parseWithImageToText({
          invocation: invocation.invocation,
          modelName: invocation.modelName,
          base64Pdf,
          parseSystemPrompt,
          preferredNormalizationModelSlug: promptConfig.postOcrNormalizationModelSlug,
        });
        content = ocrResult.content;
        usage = ocrResult.usage;
        normalizationFailed = ocrResult.normalizationFailed;
      }
    }

    const { title, authors, metadata } = this.parseMetadata(content);
    const mergedMetadata = normalizationFailed
      ? { ...(metadata ?? {}), parseNormalization: "failed_fallback_raw" }
      : metadata;

    return {
      markup: content,
      title,
      authors,
      metadata: mergedMetadata,
      usage,
      model: invocation.modelName,
    };
  }

  async complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const taskType = options?.taskType ?? "SUMMARIZE";
    const invocation = await this.resolveInvocation(taskType, options?.modelSlug);

    if (invocation.invocation.apiStyle === "ANTHROPIC_MESSAGES") {
      const data = await this.sendAnthropicMessages(invocation.invocation, {
        model: invocation.modelName,
        messages,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      });

      return {
        content: this.extractAnthropicContent(data),
        usage: this.extractUsage(data),
        model: invocation.modelName,
      };
    }

    const body: Record<string, unknown> = {
      model: invocation.modelName,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };

    if (options?.maxTokens) body.max_tokens = options.maxTokens;
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const data = await this.sendOpenAIChatCompletion(invocation.invocation, body, "completion");

    return {
      content: this.extractOpenAIContent(data),
      usage: this.extractUsage(data),
      model: invocation.modelName,
    };
  }

  private async parseWithImageToText(args: {
    invocation: ModelInvocationConfig;
    modelName: string;
    base64Pdf: string;
    parseSystemPrompt: string;
    preferredNormalizationModelSlug: string | null;
  }): Promise<{ content: string; usage: TokenUsage; normalizationFailed: boolean }> {
    const body = buildImageToTextParseBody(args.modelName, args.base64Pdf);
    const data = await this.sendImageToTextParse(args.invocation, body);
    const ocrContent = extractImageToTextContent(data);
    const ocrUsage = this.extractUsage(data);

    if (ocrContent.trim().length === 0) {
      return {
        content: ocrContent,
        usage: ocrUsage,
        normalizationFailed: false,
      };
    }

    const normalized = await this.tryNormalizeOcrContent({
      rawContent: ocrContent,
      parseSystemPrompt: args.parseSystemPrompt,
      preferredModelSlug: args.preferredNormalizationModelSlug,
    });

    if (!normalized) {
      return {
        content: ocrContent,
        usage: ocrUsage,
        normalizationFailed: true,
      };
    }

    return {
      content: normalized.content,
      usage: mergeUsage(ocrUsage, normalized.usage),
      normalizationFailed: false,
    };
  }

  private async tryNormalizeOcrContent(args: {
    rawContent: string;
    parseSystemPrompt: string;
    preferredModelSlug: string | null;
  }): Promise<{ content: string; usage: TokenUsage } | null> {
    try {
      const selection = await this.resolvePostOcrNormalizationInvocation(args.preferredModelSlug);
      let content = "";
      let usage: TokenUsage;

      if (selection.invocation.apiStyle === "ANTHROPIC_MESSAGES") {
        const data = await this.sendAnthropicMessages(selection.invocation, {
          model: selection.modelName,
          messages: [
            { role: "system", content: args.parseSystemPrompt },
            {
              role: "user",
              content: `${POST_OCR_NORMALIZATION_USER_PROMPT}\n${args.rawContent}`,
            },
          ],
          temperature: 0,
          maxTokens: 8192,
        });
        content = this.extractAnthropicContent(data);
        usage = this.extractUsage(data);
      } else {
        const body: Record<string, unknown> = {
          model: selection.modelName,
          messages: [
            { role: "system", content: args.parseSystemPrompt },
            {
              role: "user",
              content: `${POST_OCR_NORMALIZATION_USER_PROMPT}\n${args.rawContent}`,
            },
          ],
          temperature: 0,
          max_tokens: 8192,
        };
        const data = await this.sendOpenAIChatCompletion(
          selection.invocation,
          body,
          "completion"
        );
        content = this.extractOpenAIContent(data);
        usage = this.extractUsage(data);
      }

      const normalizedContent = content.trim();
      if (normalizedContent.length === 0) {
        return null;
      }

      return {
        content: normalizedContent,
        usage,
      };
    } catch (error) {
      const message = error instanceof Error ? sanitizeProviderErrorText(error.message) : "Unknown error";
      console.warn(`Post-OCR normalization failed: ${message}`);
      return null;
    }
  }

  private async resolvePostOcrNormalizationInvocation(
    preferredModelSlug: string | null
  ): Promise<InvocationSelection> {
    if (preferredModelSlug) {
      const { model, invocation } = await resolveInvocationForSpecificModel({
        taskType: "SUMMARIZE",
        modelSlug: preferredModelSlug,
      });
      return {
        invocation,
        modelName: model.deploymentName,
      };
    }

    return this.resolveInvocation("SUMMARIZE");
  }

  private async resolveInvocation(
    taskType: JobType,
    modelSlug?: string
  ): Promise<InvocationSelection> {
    try {
      const { model, invocation } = await resolveInvocationForTask({
        taskType,
        requestedModelSlug: modelSlug,
      });

      return { invocation, modelName: model.deploymentName };
    } catch (error) {
      if (!(error instanceof ModelRoutingError)) {
        throw error;
      }

      if (error.code !== "TASK_DEFAULT_MODEL_MISSING") {
        throw error;
      }

      if (!this.fallbackEndpoint) {
        throw error;
      }

      const modelName = taskType === "PARSE_PDF"
        ? this.parserDeployment
        : this.completionDeployment;

      return {
        modelName,
        invocation: {
          apiStyle: taskType === "PARSE_PDF" ? "AZURE_IMAGE_TO_TEXT" : "AZURE_CHAT_COMPLETIONS",
          authStyle: "API_KEY",
          deploymentName: modelName,
          apiVersion: this.fallbackApiVersion,
          baseUrl: this.fallbackEndpoint,
          invokePath: taskType === "PARSE_PDF"
            ? "/v1/ocr"
            : `/openai/deployments/${modelName}/chat/completions`,
        },
      };
    }
  }

  private async sendOpenAIChatCompletion(
    invocation: ModelInvocationConfig,
    body: Record<string, unknown>,
    operation: "parse" | "completion"
  ): Promise<Record<string, unknown>> {
    const url = this.buildOpenAIUrl(invocation);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(invocation.authStyle),
        ...invocation.extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = sanitizeProviderErrorText(await response.text());
      throw new Error(
        `Azure AI Foundry ${operation} failed (${response.status}): ${errorText}`
      );
    }

    return response.json();
  }

  private async sendImageToTextParse(
    invocation: ModelInvocationConfig,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = this.buildImageToTextUrl(invocation);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(invocation.authStyle),
        ...invocation.extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = sanitizeProviderErrorText(await response.text());
      throw new Error(
        `Azure AI Foundry parse failed (${response.status}): ${errorText}`
      );
    }

    return response.json();
  }

  private async sendAnthropicMessages(
    invocation: ModelInvocationConfig,
    args: {
      model: string;
      messages: Message[];
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<Record<string, unknown>> {
    const url = this.buildAnthropicUrl(invocation);
    const system = args.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n")
      .trim();

    const chatMessages = args.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: args.model,
      messages: chatMessages,
      max_tokens: args.maxTokens ?? 4096,
    };

    if (system) body.system = system;
    if (args.temperature !== undefined) body.temperature = args.temperature;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.getAuthHeaders(invocation.authStyle),
      ...invocation.extraHeaders,
    };

    if (!headers["anthropic-version"]) {
      headers["anthropic-version"] = "2023-06-01";
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = sanitizeProviderErrorText(await response.text());
      throw new Error(
        `Azure AI Foundry completion failed (${response.status}): ${errorText}`
      );
    }

    return response.json();
  }

  private buildImageToTextUrl(invocation: ModelInvocationConfig): string {
    if (invocation.apiStyle === "FULL_TARGET_URI") {
      if (!invocation.targetUri) {
        throw new Error("Model endpoint misconfigured: targetUri is required for FULL_TARGET_URI.");
      }
      return invocation.targetUri;
    }

    if (!invocation.baseUrl) {
      throw new Error("Model endpoint misconfigured: baseUrl is required.");
    }

    const path = invocation.invokePath ?? "/v1/ocr";
    const version = invocation.apiVersion ?? this.fallbackApiVersion;
    const normalizedBase = invocation.baseUrl.replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${normalizedBase}${normalizedPath}`);

    if (version && !url.searchParams.get("api-version")) {
      url.searchParams.set("api-version", version);
    }

    return url.toString();
  }

  private buildOpenAIUrl(invocation: ModelInvocationConfig): string {
    if (invocation.apiStyle === "FULL_TARGET_URI") {
      if (!invocation.targetUri) {
        throw new Error("Model endpoint misconfigured: targetUri is required for FULL_TARGET_URI.");
      }
      return invocation.targetUri;
    }

    if (!invocation.baseUrl) {
      throw new Error("Model endpoint misconfigured: baseUrl is required.");
    }

    const path = invocation.invokePath ?? "/models/chat/completions";
    const version = invocation.apiVersion ?? this.fallbackApiVersion;
    if (!version) {
      throw new Error("Model endpoint misconfigured: apiVersion is required for chat completions.");
    }

    const normalizedBase = invocation.baseUrl.replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${normalizedBase}${normalizedPath}`);
    if (!url.searchParams.get("api-version")) {
      url.searchParams.set("api-version", version);
    }

    return url.toString();
  }

  private buildAnthropicUrl(invocation: ModelInvocationConfig): string {
    if (invocation.apiStyle === "FULL_TARGET_URI") {
      if (!invocation.targetUri) {
        throw new Error("Model endpoint misconfigured: targetUri is required for FULL_TARGET_URI.");
      }
      return invocation.targetUri;
    }

    if (!invocation.baseUrl) {
      throw new Error("Model endpoint misconfigured: baseUrl is required.");
    }

    const path = invocation.invokePath ?? "/anthropic/v1/messages";
    const normalizedBase = invocation.baseUrl.replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    return `${normalizedBase}${normalizedPath}`;
  }

  private getAuthHeaders(authStyle: ModelInvocationConfig["authStyle"]): Record<string, string> {
    if (authStyle === "X_API_KEY") {
      return { "x-api-key": this.apiKey };
    }

    return { "api-key": this.apiKey };
  }

  private extractOpenAIContent(data: Record<string, unknown>): string {
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const content = message?.content;

    if (typeof content === "string") return content;

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === "string") return item;
          if (!item || typeof item !== "object") return "";
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        })
        .join("\n")
        .trim();
    }

    return "";
  }

  private extractAnthropicContent(data: Record<string, unknown>): string {
    const content = data.content;
    if (!Array.isArray(content)) return "";

    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .join("\n")
      .trim();
  }

  private extractUsage(data: Record<string, unknown>): TokenUsage {
    const usage = data.usage as
      | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; input_tokens?: number; output_tokens?: number }
      | undefined;

    const inputTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;

    return {
      inputTokens,
      outputTokens,
      totalTokens,
    };
  }

  private parseMetadata(content: string): {
    title?: string;
    authors?: string;
    metadata?: Record<string, unknown>;
  } {
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
    if (!yamlMatch) return {};

    const yamlBlock = yamlMatch[1];
    const metadata: Record<string, unknown> = {};
    let title: string | undefined;
    let authors: string | undefined;

    for (const line of yamlBlock.split("\n")) {
      const match = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      if (key === "title") title = value;
      else if (key === "authors") authors = value;
      else metadata[key] = value;
    }

    return { title, authors, metadata };
  }
}
