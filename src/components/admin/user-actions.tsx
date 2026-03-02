"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface UserActionsProps {
  userId: string;
  currentRole: string;
  isActive: boolean;
  isSelf: boolean;
}

export function UserActions({ userId, currentRole, isActive, isSelf }: UserActionsProps) {
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

  return (
    <div className="flex items-center gap-3">
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
    </div>
  );
}
