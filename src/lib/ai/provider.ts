import { prisma } from "@/lib/db";
import type { AIProvider } from "./types";
import { AzureFoundryProvider } from "./azure-foundry";

export type { AIProvider } from "./types";

export async function getAIProvider(): Promise<AIProvider> {
  // Look up the default document parser model config
  const parserModel = await prisma.modelConfig.findFirst({
    where: { category: "DOCUMENT_PARSER", isDefault: true, isActive: true },
  });

  const completionModel = await prisma.modelConfig.findFirst({
    where: { category: "CHAT_COMPLETION", isDefault: true, isActive: true },
  });

  return new AzureFoundryProvider({
    endpoint: process.env.AZURE_AI_FOUNDRY_ENDPOINT!,
    apiKey: process.env.AZURE_AI_FOUNDRY_KEY!,
    apiVersion: process.env.AZURE_AI_FOUNDRY_API_VERSION ?? "2025-01-01",
    parserDeployment: parserModel?.deploymentName,
    completionDeployment: completionModel?.deploymentName,
  });
}
