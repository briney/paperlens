import type { JobType } from "@prisma/client";

export const DEFAULT_TASK_SYSTEM_PROMPTS: Record<JobType, string | null> = {
  PARSE_PDF: `You are a scientific document parser. Extract the full text content of the provided PDF document as clean markdown. Preserve the document structure including:
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

Then output the full document content as clean markdown.`,
  SUMMARIZE: `You are an expert scientific paper analyst. Given the parsed markdown content of a scientific paper, produce a comprehensive yet concise summary in structured markdown format.

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
- If information for a section is not available in the paper, note that briefly rather than speculating`,
  PEER_REVIEW: null,
  CLAIM_VERIFY: null,
  JOURNAL_CLUB: null,
  NOVELTY_ASSESS: null,
  CUSTOM: null,
};

export type TaskPromptSource = "override" | "default" | "none";

export interface ResolvedTaskPrompt {
  taskType: JobType;
  prompt: string | null;
  source: TaskPromptSource;
  defaultPrompt: string | null;
  systemPromptOverride: string | null;
  postOcrNormalizationModelSlug: string | null;
}

function normalizePromptOverride(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().length > 0 ? value : null;
}

export function getBuiltInTaskPrompt(taskType: JobType): string | null {
  return DEFAULT_TASK_SYSTEM_PROMPTS[taskType] ?? null;
}

export async function resolveTaskPrompt(taskType: JobType): Promise<ResolvedTaskPrompt> {
  const { prisma } = await import("../db");
  const policy = await prisma.taskModelPolicy.findUnique({
    where: { taskType },
    select: {
      systemPromptOverride: true,
      postOcrNormalizationModelSlug: true,
    },
  });

  const defaultPrompt = getBuiltInTaskPrompt(taskType);
  const systemPromptOverride = normalizePromptOverride(policy?.systemPromptOverride);
  const postOcrNormalizationModelSlug =
    typeof policy?.postOcrNormalizationModelSlug === "string"
      ? policy.postOcrNormalizationModelSlug
      : null;

  if (systemPromptOverride) {
    return {
      taskType,
      prompt: systemPromptOverride,
      source: "override",
      defaultPrompt,
      systemPromptOverride,
      postOcrNormalizationModelSlug,
    };
  }

  if (defaultPrompt) {
    return {
      taskType,
      prompt: defaultPrompt,
      source: "default",
      defaultPrompt,
      systemPromptOverride: null,
      postOcrNormalizationModelSlug,
    };
  }

  return {
    taskType,
    prompt: null,
    source: "none",
    defaultPrompt: null,
    systemPromptOverride: null,
    postOcrNormalizationModelSlug,
  };
}
