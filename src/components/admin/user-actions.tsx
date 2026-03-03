"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

interface UserActionsProps {
  userId: string;
  currentRole: string;
  isActive: boolean;
  approvalStatus: string;
  isSelf: boolean;
}

export function UserActions({
  userId,
  currentRole,
  isActive,
  approvalStatus,
  isSelf,
}: UserActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function updateUser(data: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to update user");
        return;
      }
      toast.success("User updated");
      router.refresh();
    } catch {
      toast.error("Failed to update user");
    } finally {
      setLoading(false);
    }
  }

  async function removeUser() {
    if (isSelf) {
      toast.error("Cannot remove your own account");
      return;
    }

    const confirmed = window.confirm(
      "Soft-delete this user? They will lose access until restored."
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to remove user");
        return;
      }
      toast.success("User removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Switch
        checked={isActive}
        onCheckedChange={(checked) => updateUser({ isActive: checked })}
        disabled={isSelf || loading}
        aria-label="Toggle active"
      />
      <Select
        value={currentRole}
        onValueChange={(role) => updateUser({ role })}
        disabled={isSelf || loading}
      >
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="USER">User</SelectItem>
          <SelectItem value="ADMIN">Admin</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={approvalStatus}
        onValueChange={(status) => updateUser({ approvalStatus: status })}
        disabled={loading}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="APPROVED">Approved</SelectItem>
          <SelectItem value="REJECTED">Rejected</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        onClick={removeUser}
        disabled={isSelf || loading}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        Remove
      </Button>
    </div>
  );
}
