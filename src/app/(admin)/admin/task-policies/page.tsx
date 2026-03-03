import { prisma } from "@/lib/db";
import { TaskPolicyEditor } from "@/components/admin/task-policy-editor";
import { isModelCompatibleWithTask } from "@/lib/ai/model-routing";
import { getBuiltInTaskPrompt } from "@/lib/ai/task-prompts";

const TASK_TYPES = [
  "PARSE_PDF",
  "SUMMARIZE",
  "PEER_REVIEW",
  "CLAIM_VERIFY",
  "JOURNAL_CLUB",
  "NOVELTY_ASSESS",
  "CUSTOM",
] as const;

export default async function AdminTaskPoliciesPage() {
  const [activeModels, policies] = await Promise.all([
    prisma.modelConfig.findMany({
      where: { isActive: true },
      select: {
        slug: true,
        displayName: true,
        category: true,
        supportedTasks: true,
        capabilities: true,
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.taskModelPolicy.findMany({
      orderBy: { taskType: "asc" },
    }),
  ]);

  const models = activeModels.map((model) => ({
    slug: model.slug,
    displayName: model.displayName,
  }));
  const normalizationModels = activeModels
    .filter((model) => isModelCompatibleWithTask(model, "SUMMARIZE"))
    .map((model) => ({
      slug: model.slug,
      displayName: model.displayName,
    }));

  const policyByTask = new Map(policies.map((policy) => [policy.taskType, policy]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Task Model Policies</h1>
        <p className="text-muted-foreground">
          Route each analysis task to a default model, with optional user overrides and fallbacks.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {TASK_TYPES.map((taskType) => {
          const policy = policyByTask.get(taskType);
          return (
            <TaskPolicyEditor
              key={taskType}
              taskType={taskType}
              models={models}
              normalizationModels={normalizationModels}
              builtInPrompt={getBuiltInTaskPrompt(taskType)}
              initialPolicy={
                policy
                  ? {
                      defaultModelSlug: policy.defaultModelSlug,
                      systemPromptOverride: policy.systemPromptOverride,
                      postOcrNormalizationModelSlug: policy.postOcrNormalizationModelSlug,
                      allowUserOverride: policy.allowUserOverride,
                      fallbackModelSlugs: Array.isArray(policy.fallbackModelSlugs)
                        ? (policy.fallbackModelSlugs.filter(
                            (item): item is string => typeof item === "string"
                          ) as string[])
                        : [],
                      constraints:
                        policy.constraints &&
                        typeof policy.constraints === "object" &&
                        !Array.isArray(policy.constraints)
                          ? (policy.constraints as Record<string, boolean>)
                          : null,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
