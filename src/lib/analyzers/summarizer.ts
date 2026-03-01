import { registerAnalyzer } from "./registry";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "./types";

const SUMMARIZER_SYSTEM_PROMPT = `You are an expert scientific paper analyst. Given the parsed markdown content of a scientific paper, produce a comprehensive yet concise summary in structured markdown format.

Your summary MUST include the following sections:

## Key Findings
- Bullet points of the main results and conclusions

## Methods Overview
- Brief description of the methodology, experimental design, or analytical approach

## Significance
- Why this work matters, its contribution to the field, and potential impact

## Limitations
- Acknowledged or apparent limitations of the study

## Context
- How this work relates to existing literature and what gap it fills

Guidelines:
- Be accurate and faithful to the paper's content
- Use clear, accessible language while maintaining scientific precision
- Keep each section focused and avoid redundancy
- If information for a section is not available in the paper, note that briefly rather than speculating`;

const summarizer: Analyzer = {
  type: "SUMMARIZE",
  displayName: "Summary",
  description: "Generates a structured summary of the paper including key findings, methods, significance, limitations, and context.",
  requiresParsedMarkup: true,
  requiresOriginalPdf: false,

  async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { markup, ai, modelSlug } = context;

    const result = await ai.complete(
      [
        { role: "system", content: SUMMARIZER_SYSTEM_PROMPT },
        { role: "user", content: `Please summarize the following scientific paper:\n\n${markup}` },
      ],
      {
        modelSlug,
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
