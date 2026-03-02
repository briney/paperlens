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
import { Users, Library, Cpu, ListTodo, Zap, DollarSign } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  QUEUED: "outline",
  PROCESSING: "default",
  COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "outline",
};

export default async function AdminDashboardPage() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    userCount,
    paperCount,
    activeModelCount,
    jobsByStatus,
    todayUsage,
    monthUsage,
    recentJobs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.paper.count(),
    prisma.modelConfig.count({ where: { isActive: true } }),
    prisma.job.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.usageRecord.aggregate({
      where: { createdAt: { gte: startOfDay } },
      _sum: { inputTokens: true, outputTokens: true, cost: true },
    }),
    prisma.usageRecord.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { inputTokens: true, outputTokens: true, cost: true },
    }),
    prisma.job.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        paper: { select: { title: true } },
      },
    }),
  ]);

  const jobCounts: Record<string, number> = {};
  for (const row of jobsByStatus) {
    jobCounts[row.status] = row._count.id;
  }
  const totalJobs = Object.values(jobCounts).reduce((a, b) => a + b, 0);
  const tokensToday = (todayUsage._sum.inputTokens ?? 0) + (todayUsage._sum.outputTokens ?? 0);
  const costThisMonth = monthUsage._sum.cost ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          System overview and usage statistics.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userCount}</div>
            <p className="text-xs text-muted-foreground">registered users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Papers</CardTitle>
            <Library className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paperCount}</div>
            <p className="text-xs text-muted-foreground">total papers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Models</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeModelCount}</div>
            <p className="text-xs text-muted-foreground">active models</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Jobs</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalJobs}</div>
            <p className="text-xs text-muted-foreground">
              {jobCounts.QUEUED ?? 0} queued · {jobCounts.PROCESSING ?? 0} running
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tokens Today</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tokensToday.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">input + output</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cost (Month)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${costThisMonth.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">this month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No jobs have been processed yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Paper</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Duration</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentJobs.map((job) => {
                    const duration =
                      job.startedAt && job.completedAt
                        ? `${((job.completedAt.getTime() - job.startedAt.getTime()) / 1000).toFixed(1)}s`
                        : "—";
                    return (
                      <TableRow key={job.id}>
                        <TableCell>{job.user.name || job.user.email}</TableCell>
                        <TableCell className="max-w-48 truncate">
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
                        <TableCell className="hidden md:table-cell">{duration}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {job.createdAt.toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
