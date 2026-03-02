"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  initialPolicy?: {
    defaultModelSlug?: string | null;
    allowUserOverride?: boolean;
    fallbackModelSlugs?: string[];
    constraints?: Record<string, boolean> | null;
  };
}

export function TaskPolicyEditor({
  taskType,
  models,
  initialPolicy,
}: TaskPolicyEditorProps) {
  const router = useRouter();
  const [defaultModelSlug, setDefaultModelSlug] = useState(
    initialPolicy?.defaultModelSlug ?? ""
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
          Configure default model selection and override behavior for this task.
        </p>
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
