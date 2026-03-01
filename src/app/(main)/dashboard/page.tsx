import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, Library, FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [paperCount, completedAnalyses, recentPapers] = await Promise.all([
    prisma.paper.count({ where: { userId: user.id } }),
    prisma.job.count({
      where: { userId: user.id, status: "COMPLETED", type: { not: "PARSE_PDF" } },
    }),
    prisma.paper.findMany({
      where: { userId: user.id },
      include: {
        jobs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back. Here&apos;s an overview of your activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Papers</CardTitle>
            <Library className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paperCount}</div>
            <p className="text-xs text-muted-foreground">papers uploaded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Analyses</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedAnalyses}</div>
            <p className="text-xs text-muted-foreground">analyses completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Quick Upload</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link href="/upload">Upload a paper</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Papers</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPapers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No papers yet. Upload your first paper to get started.
            </p>
          ) : (
            <div className="divide-y">
              {recentPapers.map((paper) => {
                const latestJob = paper.jobs[0];
                const status = latestJob?.status ?? "QUEUED";
                const statusVariant =
                  status === "COMPLETED"
                    ? ("default" as const)
                    : status === "FAILED"
                    ? ("destructive" as const)
                    : ("secondary" as const);

                return (
                  <Link
                    key={paper.id}
                    href={`/papers/${paper.id}`}
                    className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-3 px-3 rounded-md transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {paper.title ?? "Untitled Paper"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {paper.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={statusVariant}>{status}</Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
