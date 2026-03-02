import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobActions } from "@/components/admin/job-actions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  QUEUED: "outline",
  PROCESSING: "default",
  COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "outline",
};

export default async function AdminJobsPage() {
  const [jobsByStatus, jobs] = await Promise.all([
    prisma.job.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.job.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        paper: { select: { title: true } },
      },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of jobsByStatus) {
    statusCounts[row.status] = row._count.id;
  }

  const summaryCards = [
    { label: "Queued", key: "QUEUED" },
    { label: "Processing", key: "PROCESSING" },
    { label: "Completed", key: "COMPLETED" },
    { label: "Failed", key: "FAILED" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Queue</h1>
        <p className="text-muted-foreground">
          Monitor and manage the processing queue.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {summaryCards.map(({ label, key }) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statusCounts[key] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs found.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden md:table-cell">ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Paper</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Error</TableHead>
                <TableHead className="hidden md:table-cell">Duration</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const duration =
                  job.startedAt && job.completedAt
                    ? `${((job.completedAt.getTime() - job.startedAt.getTime()) / 1000).toFixed(1)}s`
                    : "—";
                return (
                  <TableRow key={job.id}>
                    <TableCell className="hidden md:table-cell font-mono text-xs">
                      {job.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{job.user.name || job.user.email}</TableCell>
                    <TableCell className="max-w-40 truncate">
                      {job.paper.title || "Untitled"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.type.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[job.status] ?? "outline"}>
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-48 truncate text-xs text-muted-foreground">
                      {job.error || "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{duration}</TableCell>
                    <TableCell>
                      <JobActions jobId={job.id} status={job.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
