import { registerAnalyzer } from "./registry";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "./types";
import { resolveTaskPrompt } from "@/lib/ai/task-prompts";

const summarizer: Analyzer = {
  type: "SUMMARIZE",
  taskType: "SUMMARIZE",
  displayName: "Summary",
  description: "Generates a structured summary of the paper including key findings, methods, significance, limitations, and context.",
  requiresParsedMarkup: true,
  requiresOriginalPdf: false,

  async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { markup, ai, modelSlug } = context;
    const prompt = await resolveTaskPrompt("SUMMARIZE");

    if (!prompt.prompt) {
      throw new Error("No system prompt is configured for SUMMARIZE.");
    }

    const result = await ai.complete(
      [
        { role: "system", content: prompt.prompt },
        { role: "user", content: `Please summarize the following scientific paper:\n\n${markup}` },
      ],
      {
        modelSlug,
        taskType: "SUMMARIZE",
        temperature: 0.3,
        maxTokens: 4096,
      }
    );

    return {
      content: result.content,
      usage: result.usage,
      model: result.model,
    };
  },
};

registerAnalyzer(summarizer);
