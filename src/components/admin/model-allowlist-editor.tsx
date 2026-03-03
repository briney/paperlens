"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface ModelOption {
  slug: string;
  displayName: string;
  category: string;
}

interface ModelAllowlistEditorProps {
  userId: string;
  models: ModelOption[];
  initialAllowedModelSlugs: string[];
}

export function ModelAllowlistEditor({
  userId,
  models,
  initialAllowedModelSlugs,
}: ModelAllowlistEditorProps) {
  const router = useRouter();
  const initialSet = useMemo(() => new Set(initialAllowedModelSlugs), [initialAllowedModelSlugs]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialAllowedModelSlugs));
  const [loading, setLoading] = useState(false);

  function toggleModel(slug: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  async function save() {
    setLoading(true);
    try {
      const allowedModelSlugs = [...selected].sort();
      const res = await fetch(`/api/admin/users/${userId}/models`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedModelSlugs }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update model allowlist");
        return;
      }

      toast.success("Model allowlist updated");
      router.refresh();
    } catch {
      toast.error("Failed to update model allowlist");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setSelected(new Set(initialSet));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Select allowed models. If none are selected, this user can use all compatible models.
      </p>

      {models.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active models found.</p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
          {models.map((model) => (
            <div key={model.slug} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium leading-none">{model.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {model.slug} • {model.category.replace(/_/g, " ")}
                </p>
              </div>
              <Switch
                checked={selected.has(model.slug)}
                onCheckedChange={(checked) => toggleModel(model.slug, checked)}
                disabled={loading}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={loading}>
          {loading ? "Saving..." : "Save Model Allowlist"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={loading}>
          Reset
        </Button>
      </div>
    </div>
  );
}
