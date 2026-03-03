import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserActions } from "@/components/admin/user-actions";
import { AddUserDialog } from "@/components/admin/add-user-dialog";

export default async function AdminUsersPage() {
  const currentUser = await getCurrentUser();

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      approvalStatus: true,
      createdAt: true,
      _count: { select: { papers: true } },
      quota: { select: { tier: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            View, approve, and manage users.
          </p>
        </div>
        <AddUserDialog />
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead className="hidden md:table-cell">Papers</TableHead>
                <TableHead className="hidden md:table-cell">Tier</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/users/${user.id}`} className="hover:underline">
                      {user.name || "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "secondary" : "destructive"}>
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{user._count.papers}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{user.quota?.tier ?? "FREE"}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {user.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <UserActions
                      userId={user.id}
                      currentRole={user.role}
                      isActive={user.isActive}
                      approvalStatus={user.approvalStatus}
                      isSelf={user.id === currentUser?.id}
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
