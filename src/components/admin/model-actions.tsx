"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ModelActionsProps {
  modelId: string;
  isActive: boolean;
}

export function ModelActions({ modelId, isActive }: ModelActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggleActive(checked: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: checked }),
      });
      if (!res.ok) {
        toast.error("Failed to update model");
        return;
      }
      toast.success(checked ? "Model activated" : "Model deactivated");
      router.refresh();
    } catch {
      toast.error("Failed to update model");
    } finally {
      setLoading(false);
    }
  }

  async function deleteModel() {
    if (!confirm("Delete this model? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/models/${modelId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete model");
        return;
      }
      toast.success("Model deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete model");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={isActive}
        onCheckedChange={toggleActive}
        disabled={loading}
        aria-label="Toggle active"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={deleteModel}
        disabled={loading}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
