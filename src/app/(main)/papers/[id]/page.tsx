import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, ExternalLink, Users, Calendar } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { JobStatusPoller } from "@/components/job-status-poller";

const SOURCE_LABELS: Record<string, string> = {
  UPLOAD: "Uploaded",
  PDF_URL: "PDF URL",
  PAGE_URL: "Page URL",
};

export default async function PaperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const { id } = await params;

  const paper = await prisma.paper.findFirst({
    where: { id, userId: user.id },
    include: {
      jobs: { orderBy: { createdAt: "desc" } },
      analyses: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!paper) notFound();

  // Get overall status from latest job
  const latestJob = paper.jobs[0];
  const overallStatus = latestJob?.status ?? "QUEUED";

  // Get PDF download URL if available
  let pdfUrl: string | null = null;
  if (paper.storagePath) {
    const storage = getStorage();
    pdfUrl = await storage.getUrl(paper.storagePath);
  }

  // Get markup content if available
  let markupContent: string | null = null;
  if (paper.markupPath) {
    try {
      const storage = getStorage();
      const buffer = await storage.download(paper.markupPath);
      markupContent = buffer.toString("utf-8");
    } catch {
      // Markup not yet available
    }
  }

  const statusVariant =
    overallStatus === "COMPLETED"
      ? ("default" as const)
      : overallStatus === "FAILED"
      ? ("destructive" as const)
      : ("secondary" as const);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/papers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {paper.title ?? "Untitled Paper"}
            </h1>
            <Badge variant={statusVariant}>{overallStatus}</Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            {paper.authors && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {paper.authors}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {paper.createdAt.toLocaleDateString()}
            </span>
            <Badge variant="outline">{SOURCE_LABELS[paper.source] ?? paper.source}</Badge>
            {paper.sourceUrl && (
              <a
                href={paper.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Source
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Job Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Processing Status</CardTitle>
        </CardHeader>
        <CardContent>
          <JobStatusPoller
            paperId={paper.id}
            initialJobs={paper.jobs.map((j) => ({
              id: j.id,
              type: j.type,
              status: j.status,
              error: j.error,
              startedAt: j.startedAt?.toISOString() ?? null,
              completedAt: j.completedAt?.toISOString() ?? null,
              createdAt: j.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="markup">Markup</TabsTrigger>
          <TabsTrigger value="original">Original</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Summary analysis will be available in Phase 3.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="markup">
          <Card>
            <CardHeader>
              <CardTitle>Parsed Markup</CardTitle>
            </CardHeader>
            <CardContent>
              {markupContent ? (
                <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                  {markupContent}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {overallStatus === "COMPLETED"
                    ? "No parsed markup available for this paper."
                    : "Parsed document markup will appear here after processing completes."}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="original">
          <Card>
            <CardHeader>
              <CardTitle>Original PDF</CardTitle>
            </CardHeader>
            <CardContent>
              {pdfUrl ? (
                <div className="space-y-4">
                  <Button asChild>
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {overallStatus === "QUEUED" || overallStatus === "PROCESSING"
                    ? "PDF will be available once fetching completes."
                    : "No PDF available for this paper."}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
