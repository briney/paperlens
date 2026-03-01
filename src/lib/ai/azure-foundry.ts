import { prisma } from "@/lib/db";
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
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  parserDeployment?: string;
  completionDeployment?: string;
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
  private endpoint: string;
  private apiKey: string;
  private apiVersion: string;
  private parserDeployment: string;
  private completionDeployment: string;

  constructor(config: AzureFoundryConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion;
    this.parserDeployment = config.parserDeployment ?? "mistral-document-ai-2512";
    this.completionDeployment = config.completionDeployment ?? "gpt-4o";
  }

  async parseDocument(
    pdfBuffer: Buffer,
    _options?: ParseOptions
  ): Promise<ParseResult> {
    const base64Pdf = pdfBuffer.toString("base64");

    const body = {
      model: this.parserDeployment,
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

    const url = `${this.endpoint}/chat/completions?api-version=${this.apiVersion}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Azure AI Foundry parse failed (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const usage = this.extractUsage(data);

    // Extract metadata from YAML front matter
    const { title, authors, metadata } = this.parseMetadata(content);

    return {
      markup: content,
      title,
      authors,
      metadata,
      usage,
      model: this.parserDeployment,
    };
  }

  async complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const deployment = await this.resolveDeployment(options?.modelSlug);

    const body: Record<string, unknown> = {
      model: deployment,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };

    if (options?.maxTokens) body.max_tokens = options.maxTokens;
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const url = `${this.endpoint}/chat/completions?api-version=${this.apiVersion}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Azure AI Foundry completion failed (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const usage = this.extractUsage(data);

    return { content, usage, model: deployment };
  }

  private async resolveDeployment(modelSlug?: string): Promise<string> {
    if (!modelSlug) return this.completionDeployment;

    const model = await prisma.modelConfig.findUnique({
      where: { slug: modelSlug, isActive: true },
    });

    return model?.deploymentName ?? this.completionDeployment;
  }

  private extractUsage(data: Record<string, unknown>): TokenUsage {
    const usage = data.usage as Record<string, number> | undefined;
    return {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
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
