"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, Link as LinkIcon, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Model {
  slug: string;
  displayName: string;
  isDefault: boolean;
}

type UploadState = "idle" | "uploading" | "success" | "error";

const MAX_SIZE_MB = 50;

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");

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
      .catch(() => {});
  }, []);

  const resetState = useCallback(() => {
    setUploadState("idle");
    setProgress(0);
    setErrorMessage("");
    setSelectedFile(null);
    setUrl("");
  }, []);

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return "Only PDF files are accepted.";
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File exceeds the ${MAX_SIZE_MB}MB size limit.`;
    }
    return null;
  };

  const uploadFile = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      setErrorMessage(error);
      setUploadState("error");
      return;
    }

    setSelectedFile(file);
    setUploadState("uploading");
    setProgress(10);

    const formData = new FormData();
    formData.append("file", file);

    try {
      setProgress(30);
      const response = await fetch("/api/papers", {
        method: "POST",
        body: formData,
      });

      setProgress(80);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await response.json();
      setProgress(100);
      setUploadState("success");
      toast.success("Paper uploaded successfully! Processing will begin shortly.");

      setTimeout(() => {
        router.push(`/papers/${data.paper.id}`);
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setErrorMessage(message);
      setUploadState("error");
      toast.error(message);
    }
  };

  const submitUrl = async () => {
    if (!url.trim()) return;

    try {
      new URL(url);
    } catch {
      setErrorMessage("Please enter a valid URL.");
      setUploadState("error");
      return;
    }

    setUploadState("uploading");
    setProgress(20);

    try {
      setProgress(50);
      const response = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      setProgress(80);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "URL submission failed");
      }

      const data = await response.json();
      setProgress(100);
      setUploadState("success");
      toast.success("URL submitted! The paper will be fetched and processed.");

      setTimeout(() => {
        router.push(`/papers/${data.paper.id}`);
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed";
      setErrorMessage(message);
      setUploadState("error");
      toast.error(message);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const isUploading = uploadState === "uploading";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload a Paper</h1>
        <p className="text-muted-foreground">
          Upload a PDF or paste a link to a scientific paper.
        </p>
      </div>

      {uploadState === "error" && errorMessage && (
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{errorMessage}</span>
            <Button variant="ghost" size="sm" onClick={resetState}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {uploadState === "success" && (
        <Alert className="max-w-2xl">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Paper submitted successfully! Redirecting to paper details...
          </AlertDescription>
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Upload Scientific Paper</CardTitle>
          <CardDescription>
            Supported formats: PDF files up to {MAX_SIZE_MB}MB, or a direct URL
            to a paper.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PDF Upload area */}
          <div
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            } ${isUploading ? "pointer-events-none opacity-60" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
              }}
              disabled={isUploading}
            />

            {isUploading && selectedFile ? (
              <>
                <Loader2 className="h-10 w-10 text-primary mb-4 animate-spin" />
                <p className="text-sm font-medium">
                  Uploading {selectedFile.name}...
                </p>
                <Progress value={progress} className="w-48 mt-4" />
              </>
            ) : (
              <>
                {selectedFile ? (
                  <FileText className="h-10 w-10 text-primary mb-4" />
                ) : (
                  <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                )}
                <p className="text-sm font-medium">Drop your PDF here</p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse
                </p>
              </>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                or paste a link
              </span>
            </div>
          </div>

          {/* URL input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="https://arxiv.org/abs/2401.12345"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isUploading}
                className="pl-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitUrl();
                }}
              />
            </div>
            <Button onClick={submitUrl} disabled={isUploading || !url.trim()}>
              {isUploading && !selectedFile ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Fetch
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Supports arXiv, bioRxiv, medRxiv, DOI links, and direct PDF URLs.
          </p>

          {models.length > 1 && (
            <div className="pt-2 border-t">
              <label className="text-sm font-medium mb-1.5 block">
                Analysis Model
              </label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
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
              <p className="text-xs text-muted-foreground mt-1">
                Model used for auto-summarization after upload.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
