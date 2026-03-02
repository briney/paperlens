"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

interface ModelData {
  id?: string;
  slug: string;
  displayName: string;
  provider: string;
  deploymentName: string;
  endpoint: string;
  apiVersion: string;
  category: string;
  isDefault: boolean;
  isActive: boolean;
  costPerInputToken: number;
  costPerOutputToken: number;
  maxTokens: number;
}

const EMPTY_MODEL: ModelData = {
  slug: "",
  displayName: "",
  provider: "azure-foundry",
  deploymentName: "",
  endpoint: "",
  apiVersion: "",
  category: "CHAT_COMPLETION",
  isDefault: false,
  isActive: true,
  costPerInputToken: 0,
  costPerOutputToken: 0,
  maxTokens: 4096,
};

interface ModelFormDialogProps {
  model?: ModelData;
  mode: "create" | "edit";
}

export function ModelFormDialog({ model, mode }: ModelFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ModelData>(model ?? EMPTY_MODEL);

  function resetForm() {
    setForm(model ?? EMPTY_MODEL);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const url = mode === "create" ? "/api/admin/models" : `/api/admin/models/${model?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || `Failed to ${mode} model`);
        return;
      }

      toast.success(mode === "create" ? "Model created" : "Model updated");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(`Failed to ${mode} model`);
    } finally {
      setLoading(false);
    }
  }

  function update(field: keyof ModelData, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(); }}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Model
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Model" : "Edit Model"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => update("slug", e.target.value)}
                placeholder="e.g. claude-sonnet"
                required
                disabled={mode === "edit"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(e) => update("displayName", e.target.value)}
                placeholder="e.g. Claude Sonnet"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Input
                id="provider"
                value={form.provider}
                onChange={(e) => update("provider", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deploymentName">Deployment Name</Label>
              <Input
                id="deploymentName"
                value={form.deploymentName}
                onChange={(e) => update("deploymentName", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="endpoint">Endpoint</Label>
              <Input
                id="endpoint"
                value={form.endpoint}
                onChange={(e) => update("endpoint", e.target.value)}
                placeholder="https://..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiVersion">API Version</Label>
              <Input
                id="apiVersion"
                value={form.apiVersion}
                onChange={(e) => update("apiVersion", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={form.category} onValueChange={(v) => update("category", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOCUMENT_PARSER">Document Parser</SelectItem>
                  <SelectItem value="CHAT_COMPLETION">Chat Completion</SelectItem>
                  <SelectItem value="EMBEDDING">Embedding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="costInput">Cost / 1K Input Tokens</Label>
              <Input
                id="costInput"
                type="number"
                step="0.0001"
                value={form.costPerInputToken * 1000}
                onChange={(e) => update("costPerInputToken", parseFloat(e.target.value) / 1000 || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="costOutput">Cost / 1K Output Tokens</Label>
              <Input
                id="costOutput"
                type="number"
                step="0.0001"
                value={form.costPerOutputToken * 1000}
                onChange={(e) => update("costPerOutputToken", parseFloat(e.target.value) / 1000 || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                value={form.maxTokens}
                onChange={(e) => update("maxTokens", parseInt(e.target.value) || 4096)}
              />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isDefault}
                onCheckedChange={(v) => update("isDefault", v)}
              />
              <Label>Default</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => update("isActive", v)}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : mode === "create" ? "Create Model" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
