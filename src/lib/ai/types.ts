export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ParseResult {
  markup: string;
  title?: string;
  authors?: string;
  metadata?: Record<string, unknown>;
  usage: TokenUsage;
  model: string;
}

export interface CompletionResult {
  content: string;
  usage: TokenUsage;
  model: string;
}

export interface ParseOptions {
  modelSlug?: string;
}

export interface CompletionOptions {
  modelSlug?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  parseDocument(pdfBuffer: Buffer, options?: ParseOptions): Promise<ParseResult>;
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;
}
