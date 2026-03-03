import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isValidCuid } from "@/lib/validation";
import { TIER_DEFAULTS, type TierName } from "@/lib/quota-defaults";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserActions } from "@/components/admin/user-actions";
import { QuotaFormDialog } from "@/components/admin/quota-form-dialog";
import { ModelAllowlistEditor } from "@/components/admin/model-allowlist-editor";
import { AdminUserJobActions } from "@/components/admin/admin-user-job-actions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  QUEUED: "outline",
  PROCESSING: "default",
  COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "outline",
};

function percentage(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) notFound();

  const { id } = await params;
  if (!isValidCuid(id)) notFound();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [user, jobs, models, papersToday, papersMonth, tokenUsageMonth] = await Promise.all([
    prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        approvalStatus: true,
        createdAt: true,
        quota: {
          select: {
            tier: true,
            maxPapersPerDay: true,
            maxPapersPerMonth: true,
            maxTokensPerMonth: true,
          },
        },
        modelAllowlist: {
          select: { modelSlug: true },
          orderBy: { modelSlug: "asc" },
        },
        _count: {
          select: {
            papers: true,
            jobs: true,
          },
        },
      },
    }),
    prisma.job.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        isArchivedByAdmin: true,
        error: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        paper: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.modelConfig.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: {
        slug: true,
        displayName: true,
        category: true,
      },
    }),
    prisma.paper.count({
      where: { userId: id, createdAt: { gte: startOfDay } },
    }),
    prisma.paper.count({
      where: { userId: id, createdAt: { gte: startOfMonth } },
    }),
    prisma.usageRecord.aggregate({
      where: { userId: id, createdAt: { gte: startOfMonth } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ]);

  if (!user) notFound();

  const tier = (user.quota?.tier ?? "FREE") as TierName;
  const tierDefaults = TIER_DEFAULTS[tier] ?? TIER_DEFAULTS.FREE;
  const maxPapersPerDay = user.quota?.maxPapersPerDay ?? tierDefaults.maxPapersPerDay;
  const maxPapersPerMonth = user.quota?.maxPapersPerMonth ?? tierDefaults.maxPapersPerMonth;
  const maxTokensPerMonth = user.quota?.maxTokensPerMonth ?? tierDefaults.maxTokensPerMonth;
  const tokensUsedMonth = (tokenUsageMonth._sum.inputTokens ?? 0) + (tokenUsageMonth._sum.outputTokens ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/users" className="hover:underline">
              Users
            </Link>
            {" "}/ {user.email}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{user.name || user.email}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
            <Badge variant={user.isActive ? "secondary" : "destructive"}>
              {user.isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge
              variant={
                user.approvalStatus === "APPROVED"
                  ? "secondary"
                  : user.approvalStatus === "REJECTED"
                  ? "destructive"
                  : "outline"
              }
            >
              {user.approvalStatus}
            </Badge>
            <Badge variant="outline">Joined {user.createdAt.toLocaleDateString()}</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <UserActions
            userId={user.id}
            currentRole={user.role}
            isActive={user.isActive}
            approvalStatus={user.approvalStatus}
            isSelf={user.id === currentUser.id}
          />
          <div className="pt-1">
            <QuotaFormDialog
              userId={user.id}
              userName={user.name}
              quota={user.quota}
              buttonLabel="Edit Quotas"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage vs Quotas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Papers today</span>
              <span>
                {papersToday} / {maxPapersPerDay}
              </span>
            </div>
            <Progress value={percentage(papersToday, maxPapersPerDay)} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Papers this month</span>
              <span>
                {papersMonth} / {maxPapersPerMonth}
              </span>
            </div>
            <Progress value={percentage(papersMonth, maxPapersPerMonth)} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Tokens this month</span>
              <span>
                {tokensUsedMonth.toLocaleString()} / {maxTokensPerMonth.toLocaleString()}
              </span>
            </div>
            <Progress value={percentage(tokensUsedMonth, maxTokensPerMonth)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Totals: {user._count.papers} papers · {user._count.jobs} jobs.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model Allowlist</CardTitle>
        </CardHeader>
        <CardContent>
          <ModelAllowlistEditor
            userId={user.id}
            models={models}
            initialAllowedModelSlugs={user.modelAllowlist.map((entry) => entry.modelSlug)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Jobs ({jobs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs found for this user.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Archived</TableHead>
                    <TableHead className="hidden md:table-cell">Paper</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Badge variant="outline">{job.type.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[job.status] ?? "outline"}>{job.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={job.isArchivedByAdmin ? "outline" : "secondary"}>
                          {job.isArchivedByAdmin ? "Archived" : "Visible"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden max-w-48 truncate md:table-cell">
                        {job.paper.title || "Untitled"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {job.createdAt.toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <AdminUserJobActions
                          userId={user.id}
                          jobId={job.id}
                          status={job.status}
                          isArchivedByAdmin={job.isArchivedByAdmin}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
