import type { JobType } from "@prisma/client";
import {
  resolveInvocationForTask,
  ModelRoutingError,
  type ModelInvocationConfig,
} from "./model-routing";
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

const PARSE_SYSTEM_PROMPT = `You are a scientific document parser. Extract the full text content of the provided PDF document as clean markdown. Preserve the document structure including:
- Title
- Authors
- Abstract
- Section headings
- Body text
- Figures and table captions
- References

At the very beginning, output the metadata in a YAML front matter block:
\`\`\`yaml
title: "Paper Title"
authors: "Author1, Author2, Author3"
doi: "10.xxxx/xxxxx" (if found)
journal: "Journal Name" (if found)
date: "YYYY-MM-DD" (if found)
\`\`\`

Then output the full document content as clean markdown.`;

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

    const base64Pdf = pdfBuffer.toString("base64");

    const body = {
      model: invocation.modelName,
      messages: [
        { role: "system", content: PARSE_SYSTEM_PROMPT },
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
              text: "Parse this scientific paper and output it as structured markdown with YAML front matter metadata.",
            },
          ],
        },
      ],
    };

    const data = await this.sendOpenAIChatCompletion(invocation.invocation, body, "parse");
    const content = this.extractOpenAIContent(data);
    const usage = this.extractUsage(data);

    const { title, authors, metadata } = this.parseMetadata(content);

    return {
      markup: content,
      title,
      authors,
      metadata,
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
          apiStyle: "AZURE_CHAT_COMPLETIONS",
          authStyle: "API_KEY",
          deploymentName: modelName,
          apiVersion: this.fallbackApiVersion,
          baseUrl: this.fallbackEndpoint,
          invokePath: "/chat/completions",
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
      const errorText = await response.text();
      throw new Error(
        `Azure AI Foundry ${operation} failed (${response.status}): ${errorText}`
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
      const errorText = await response.text();
      throw new Error(
        `Azure AI Foundry completion failed (${response.status}): ${errorText}`
      );
    }

    return response.json();
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
