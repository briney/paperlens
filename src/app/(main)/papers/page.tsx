import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, FileText, ExternalLink } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  QUEUED: "secondary",
  PROCESSING: "default",
  COMPLETED: "default",
  FAILED: "destructive",
  CANCELLED: "outline",
};

const SOURCE_LABELS: Record<string, string> = {
  UPLOAD: "Upload",
  PDF_URL: "PDF URL",
  PAGE_URL: "Page URL",
};

export default async function PapersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isApproved = user.approvalStatus === "APPROVED";

  const papers = await prisma.paper.findMany({
    where: { userId: user.id },
    include: {
      jobs: {
        where: { isArchivedByAdmin: false },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: { analyses: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Paper Library</h1>
          <p className="text-muted-foreground">
            All your uploaded papers and analyses.
          </p>
        </div>
        {isApproved ? (
          <Button asChild>
            <Link href="/upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload Paper
            </Link>
          </Button>
        ) : (
          <Button disabled>
            Awaiting approval
          </Button>
        )}
      </div>

      {!isApproved && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Your account is pending admin approval. Upload and analysis actions are disabled until approved.
          </CardContent>
        </Card>
      )}

      {papers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No papers yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Upload your first paper to get started.
            </p>
            {isApproved ? (
              <Button asChild>
                <Link href="/upload">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Paper
                </Link>
              </Button>
            ) : (
              <Button disabled>Awaiting approval</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your Papers ({papers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {papers.map((paper) => {
                const latestJob = paper.jobs[0];
                const status = latestJob?.status ?? "QUEUED";

                return (
                  <Link
                    key={paper.id}
                    href={`/papers/${paper.id}`}
                    className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-3 px-3 rounded-md transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {paper.title ?? "Untitled Paper"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{SOURCE_LABELS[paper.source] ?? paper.source}</span>
                          <span>&middot;</span>
                          <span>{paper.createdAt.toLocaleDateString()}</span>
                          {paper._count.analyses > 0 && (
                            <>
                              <span>&middot;</span>
                              <span>{paper._count.analyses} {paper._count.analyses === 1 ? "analysis" : "analyses"}</span>
                            </>
                          )}
                          {paper.sourceUrl && (
                            <>
                              <span>&middot;</span>
                              <ExternalLink className="h-3 w-3" />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
                      {status}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
