"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Model {
  slug: string;
  displayName: string;
  isDefault: boolean;
}

interface AnalyzeButtonProps {
  paperId: string;
  analyzerType?: string;
  label?: string;
}

export function AnalyzeButton({
  paperId,
  analyzerType = "SUMMARIZE",
  label = "Run Summary",
}: AnalyzeButtonProps) {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        const list: Model[] = data.models ?? [];
        setModels(list);
        const defaultModel = list.find((m) => m.isDefault);
        if (defaultModel) setSelectedModel(defaultModel.slug);
        else if (list.length > 0) setSelectedModel(list[0].slug);
      })
      .catch(() => {
        // Models endpoint not available — proceed without model selection
      });
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/papers/${paperId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analyzerType,
          modelSlug: selectedModel || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Analysis request failed");
      }

      toast.success("Analysis started! Results will appear shortly.");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis request failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {models.length > 1 && (
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.slug} value={model.slug}>
                {model.displayName}
                {model.isDefault ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button onClick={handleAnalyze} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        {label}
      </Button>
    </div>
  );
}
