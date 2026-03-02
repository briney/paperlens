"use client";

import { useMemo, useState } from "react";
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
  apiVersion?: string | null;
  apiStyle:
    | "AZURE_CHAT_COMPLETIONS"
    | "AZURE_IMAGE_TO_TEXT"
    | "ANTHROPIC_MESSAGES"
    | "FULL_TARGET_URI";
  authStyle: "API_KEY" | "X_API_KEY";
  baseUrl?: string | null;
  invokePath?: string | null;
  targetUri?: string | null;
  extraHeaders?: string | null;
  capabilities?: string | null;
  supportedTasks?: string | null;
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
  apiVersion: "2025-01-01",
  apiStyle: "AZURE_CHAT_COMPLETIONS",
  authStyle: "API_KEY",
  baseUrl: "",
  invokePath: "/models/chat/completions",
  targetUri: "",
  extraHeaders: "",
  capabilities: "",
  supportedTasks: "SUMMARIZE",
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

function normalizeModelForForm(model?: ModelData): ModelData {
  if (!model) return EMPTY_MODEL;

  return {
    ...model,
    apiVersion: model.apiVersion ?? "",
    baseUrl: model.baseUrl ?? "",
    invokePath: model.invokePath ?? "",
    targetUri: model.targetUri ?? "",
    extraHeaders: model.extraHeaders ?? "",
    capabilities: model.capabilities ?? "",
    supportedTasks: model.supportedTasks ?? "",
  };
}

export function ModelFormDialog({ model, mode }: ModelFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ModelData>(normalizeModelForForm(model));

  const invocationHelp = useMemo(() => {
    if (form.apiStyle === "ANTHROPIC_MESSAGES") {
      return "Use base URL + /anthropic/v1/messages path. apiVersion is not required.";
    }

    if (form.apiStyle === "AZURE_IMAGE_TO_TEXT") {
      return "Use base URL + /v1/ocr path. apiVersion is optional.";
    }

    if (form.apiStyle === "FULL_TARGET_URI") {
      return "Provide the exact invoke URL in Target URI.";
    }

    return "Use base URL + chat-completions path. apiVersion is required.";
  }, [form.apiStyle]);

  function resetForm() {
    setForm(normalizeModelForForm(model));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const url = mode === "create" ? "/api/admin/models" : `/api/admin/models/${model?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const payload = {
        ...form,
        extraHeaders: form.extraHeaders?.trim() ? form.extraHeaders : null,
        capabilities: form.capabilities?.trim() ? form.capabilities : null,
        supportedTasks: form.supportedTasks?.trim() || null,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  function update(field: keyof ModelData, value: string | number | boolean | null) {
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
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
            <div className="space-y-2">
              <Label htmlFor="apiStyle">API Style</Label>
              <Select
                value={form.apiStyle}
                onValueChange={(v) => {
                  const style = v as ModelData["apiStyle"];
                  update("apiStyle", style);

                  if (style === "ANTHROPIC_MESSAGES") {
                    update("authStyle", "X_API_KEY");
                    if (!form.invokePath) update("invokePath", "/anthropic/v1/messages");
                  }
                  if (style === "AZURE_IMAGE_TO_TEXT") {
                    update("authStyle", "API_KEY");
                    if (!form.invokePath || form.invokePath.includes("chat/completions")) {
                      update("invokePath", "/v1/ocr");
                    }
                  }
                  if (style === "AZURE_CHAT_COMPLETIONS") {
                    update("authStyle", "API_KEY");
                    if (!form.invokePath || form.invokePath.includes("/v1/ocr")) {
                      update("invokePath", "/models/chat/completions");
                    }
                    if (!form.apiVersion) update("apiVersion", "2025-01-01");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AZURE_CHAT_COMPLETIONS">azure_chat_completions</SelectItem>
                  <SelectItem value="AZURE_IMAGE_TO_TEXT">azure_image_to_text</SelectItem>
                  <SelectItem value="ANTHROPIC_MESSAGES">anthropic_messages</SelectItem>
                  <SelectItem value="FULL_TARGET_URI">full_target_uri</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="authStyle">Auth Style</Label>
              <Select value={form.authStyle} onValueChange={(v) => update("authStyle", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="API_KEY">api-key header</SelectItem>
                  <SelectItem value="X_API_KEY">x-api-key header</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                value={form.baseUrl ?? ""}
                onChange={(e) => update("baseUrl", e.target.value)}
                placeholder="https://your-resource.services.ai.azure.com"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invokePath">Invoke Path</Label>
              <Input
                id="invokePath"
                value={form.invokePath ?? ""}
                onChange={(e) => update("invokePath", e.target.value)}
                placeholder="/models/chat/completions, /v1/ocr, or /anthropic/v1/messages"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="targetUri">Target URI</Label>
              <Input
                id="targetUri"
                value={form.targetUri ?? ""}
                onChange={(e) => update("targetUri", e.target.value)}
                placeholder="https://... (for full_target_uri)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiVersion">API Version</Label>
              <Input
                id="apiVersion"
                value={form.apiVersion ?? ""}
                onChange={(e) => update("apiVersion", e.target.value)}
                placeholder="e.g. 2025-01-01"
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
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supportedTasks">Supported Tasks (comma-separated)</Label>
              <Input
                id="supportedTasks"
                value={form.supportedTasks ?? ""}
                onChange={(e) => update("supportedTasks", e.target.value)}
                placeholder="PARSE_PDF,SUMMARIZE,JOURNAL_CLUB"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="extraHeaders">Extra Headers (JSON)</Label>
              <Input
                id="extraHeaders"
                value={form.extraHeaders ?? ""}
                onChange={(e) => update("extraHeaders", e.target.value)}
                placeholder='{"anthropic-version":"2023-06-01"}'
              />
              <p className="text-xs text-muted-foreground">{invocationHelp}</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="capabilities">Capabilities (JSON)</Label>
              <Input
                id="capabilities"
                value={form.capabilities ?? ""}
                onChange={(e) => update("capabilities", e.target.value)}
                placeholder='{"tools":true,"longContext":true}'
              />
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : mode === "create" ? "Create Model" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
