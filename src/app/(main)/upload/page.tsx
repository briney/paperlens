import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload a Paper</h1>
        <p className="text-muted-foreground">
          Upload a PDF or paste a link to a scientific paper.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Upload Scientific Paper</CardTitle>
          <CardDescription>
            Supported formats: PDF files up to 50MB, or a direct URL to a paper.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PDF Upload area */}
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center">
            <Upload className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Drop your PDF here</p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-4">
              PDF upload will be available in Phase 2
            </p>
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
            <Input
              placeholder="https://arxiv.org/abs/2401.12345"
              disabled
            />
            <Button disabled>Fetch</Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Full upload and processing functionality coming in Phase 2.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
