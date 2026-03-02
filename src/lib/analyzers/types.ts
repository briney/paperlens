import type { AIProvider, TokenUsage } from "@/lib/ai/types";
import type { JobType } from "@prisma/client";

export interface AnalyzerContext {
  paper: {
    id: string;
    title: string | null;
    authors: string | null;
    metadata: Record<string, unknown> | null;
  };
  markup: string;
  pdfBuffer?: Buffer;
  ai: AIProvider;
  modelSlug?: string;
  config?: Record<string, unknown>;
}

export interface AnalyzerResult {
  content: string;
  metadata?: Record<string, unknown>;
  usage: TokenUsage;
  model: string;
}

export interface Analyzer {
  type: string;
  taskType: JobType;
  displayName: string;
  description: string;
  requiresParsedMarkup: boolean;
  requiresOriginalPdf: boolean;
  requiredCapabilities?: Record<string, boolean>;
  execute(context: AnalyzerContext): Promise<AnalyzerResult>;
}
