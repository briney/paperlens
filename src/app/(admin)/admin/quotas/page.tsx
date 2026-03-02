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
import { QuotaFormDialog } from "@/components/admin/quota-form-dialog";
import { TIER_DEFAULTS } from "@/lib/quota-defaults";

export default async function AdminQuotasPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      quota: true,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quota Management</h1>
        <p className="text-muted-foreground">
          Configure per-user and tier-based quotas.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.entries(TIER_DEFAULTS) as [string, typeof TIER_DEFAULTS.FREE][]).map(
          ([tier, defaults]) => (
            <Card key={tier}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{tier} Defaults</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>{defaults.maxPapersPerDay} papers/day</p>
                <p>{defaults.maxPapersPerMonth} papers/month</p>
                <p>{defaults.maxTokensPerMonth.toLocaleString()} tokens/month</p>
              </CardContent>
            </Card>
          )
        )}
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Papers/Day</TableHead>
                <TableHead className="hidden md:table-cell">Papers/Month</TableHead>
                <TableHead className="hidden md:table-cell">Tokens/Month</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{user.name || "—"}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.quota?.tier ?? "FREE"}</Badge>
                  </TableCell>
                  <TableCell>{user.quota?.maxPapersPerDay ?? TIER_DEFAULTS.FREE.maxPapersPerDay}</TableCell>
                  <TableCell className="hidden md:table-cell">{user.quota?.maxPapersPerMonth ?? TIER_DEFAULTS.FREE.maxPapersPerMonth}</TableCell>
                  <TableCell className="hidden md:table-cell">{(user.quota?.maxTokensPerMonth ?? TIER_DEFAULTS.FREE.maxTokensPerMonth).toLocaleString()}</TableCell>
                  <TableCell>
                    <QuotaFormDialog
                      userId={user.id}
                      userName={user.name}
                      quota={user.quota}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
