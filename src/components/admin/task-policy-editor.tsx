"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface ModelOption {
  slug: string;
  displayName: string;
}

interface TaskPolicyEditorProps {
  taskType: string;
  models: ModelOption[];
  normalizationModels: ModelOption[];
  builtInPrompt: string | null;
  initialPolicy?: {
    defaultModelSlug?: string | null;
    systemPromptOverride?: string | null;
    postOcrNormalizationModelSlug?: string | null;
    allowUserOverride?: boolean;
    fallbackModelSlugs?: string[];
    constraints?: Record<string, boolean> | null;
  };
}

export function TaskPolicyEditor({
  taskType,
  models,
  normalizationModels,
  builtInPrompt,
  initialPolicy,
}: TaskPolicyEditorProps) {
  const router = useRouter();
  const [defaultModelSlug, setDefaultModelSlug] = useState(
    initialPolicy?.defaultModelSlug ?? ""
  );
  const [systemPromptOverride, setSystemPromptOverride] = useState(
    initialPolicy?.systemPromptOverride ?? ""
  );
  const [postOcrNormalizationModelSlug, setPostOcrNormalizationModelSlug] = useState(
    initialPolicy?.postOcrNormalizationModelSlug ?? ""
  );
  const [allowUserOverride, setAllowUserOverride] = useState(
    initialPolicy?.allowUserOverride ?? true
  );
  const [fallbackModelSlugs, setFallbackModelSlugs] = useState(
    (initialPolicy?.fallbackModelSlugs ?? []).join(",")
  );
  const [constraints, setConstraints] = useState(
    initialPolicy?.constraints ? JSON.stringify(initialPolicy.constraints) : ""
  );
  const [loading, setLoading] = useState(false);

  async function savePolicy() {
    setLoading(true);
    try {
      let parsedConstraints: Record<string, boolean> | undefined;
      if (constraints.trim()) {
        const parsed = JSON.parse(constraints);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Constraints must be a JSON object of booleans");
        }
        parsedConstraints = parsed as Record<string, boolean>;
      }

      const response = await fetch("/api/admin/task-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType,
          defaultModelSlug: defaultModelSlug || null,
          systemPromptOverride:
            systemPromptOverride.trim().length > 0 ? systemPromptOverride : null,
          postOcrNormalizationModelSlug:
            taskType === "PARSE_PDF"
              ? (postOcrNormalizationModelSlug || null)
              : null,
          allowUserOverride,
          fallbackModelSlugs,
          constraints: parsedConstraints,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save task policy");
      }

      toast.success(`${taskType} policy updated`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save task policy";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function deletePolicy() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/task-policies/${taskType}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to delete task policy");
      }

      toast.success(`${taskType} policy removed`);
      setDefaultModelSlug("");
      setSystemPromptOverride("");
      setPostOcrNormalizationModelSlug("");
      setAllowUserOverride(true);
      setFallbackModelSlugs("");
      setConstraints("");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete task policy";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div>
        <h3 className="font-medium">{taskType}</h3>
        <p className="text-xs text-muted-foreground">
          Configure prompt behavior and model routing for this task.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>System Prompt</Label>
          <span className="text-xs text-muted-foreground">
            {systemPromptOverride.trim().length > 0
              ? "Customized"
              : builtInPrompt
              ? "Using default"
              : "No default"}
          </span>
        </div>
        <Textarea
          value={systemPromptOverride}
          onChange={(e) => setSystemPromptOverride(e.target.value)}
          placeholder={builtInPrompt ?? "No built-in default prompt for this task yet."}
          rows={12}
          className="font-mono text-xs"
        />
        <div className="flex justify-end">
          {systemPromptOverride.trim().length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSystemPromptOverride("")}
              disabled={loading}
            >
              Reset Prompt to Default
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSystemPromptOverride(builtInPrompt ?? "")}
              disabled={loading || !builtInPrompt}
            >
              Load Default Prompt
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Default Model</Label>
        <Select value={defaultModelSlug || "__none"} onValueChange={(v) => setDefaultModelSlug(v === "__none" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="No explicit default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No explicit default</SelectItem>
            {models.map((model) => (
              <SelectItem key={model.slug} value={model.slug}>
                {model.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {taskType === "PARSE_PDF" && (
        <div className="space-y-2">
          <Label>Post-OCR Normalization Model</Label>
          <Select
            value={postOcrNormalizationModelSlug || "__summarize_default"}
            onValueChange={(v) =>
              setPostOcrNormalizationModelSlug(v === "__summarize_default" ? "" : v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Use SUMMARIZE default model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__summarize_default">Use SUMMARIZE default model</SelectItem>
              {normalizationModels.map((model) => (
                <SelectItem key={model.slug} value={model.slug}>
                  {model.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Used when the selected parser runs OCR and a prompt-driven normalization pass is needed.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Switch checked={allowUserOverride} onCheckedChange={setAllowUserOverride} />
        <Label>Allow user override</Label>
      </div>

      <div className="space-y-2">
        <Label>Fallback Model Slugs (comma-separated)</Label>
        <Input
          value={fallbackModelSlugs}
          onChange={(e) => setFallbackModelSlugs(e.target.value)}
          placeholder="model-a,model-b"
        />
      </div>

      <div className="space-y-2">
        <Label>Constraints (JSON booleans)</Label>
        <Input
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          placeholder='{"tools":true,"longContext":true}'
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={savePolicy} disabled={loading}>
          {loading ? "Saving..." : "Save Policy"}
        </Button>
        <Button variant="outline" onClick={deletePolicy} disabled={loading}>
          Clear Policy
        </Button>
      </div>
    </div>
  );
}
