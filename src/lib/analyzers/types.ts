import type { AIProvider, TokenUsage } from "@/lib/ai/types";

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
  displayName: string;
  description: string;
  requiresParsedMarkup: boolean;
  requiresOriginalPdf: boolean;
  execute(context: AnalyzerContext): Promise<AnalyzerResult>;
}
