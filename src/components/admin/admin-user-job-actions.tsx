"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AdminUserJobActionsProps {
  userId: string;
  jobId: string;
  status: string;
  isArchivedByAdmin: boolean;
}

export function AdminUserJobActions({
  userId,
  jobId,
  status,
  isArchivedByAdmin,
}: AdminUserJobActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggleArchive(nextArchived: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchivedByAdmin: nextArchived }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update archive state");
        return;
      }

      toast.success(nextArchived ? "Job archived" : "Job unarchived");
      router.refresh();
    } catch {
      toast.error("Failed to update archive state");
    } finally {
      setLoading(false);
    }
  }

  async function deleteJob() {
    const confirmed = window.confirm("Delete this job permanently?");
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/jobs/${jobId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to delete job");
        return;
      }

      toast.success("Job deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete job");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => toggleArchive(!isArchivedByAdmin)}
        disabled={loading}
      >
        {isArchivedByAdmin ? "Unarchive" : "Archive"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={deleteJob}
        disabled={loading || status === "PROCESSING"}
        className="text-destructive hover:text-destructive"
      >
        Delete
      </Button>
    </div>
  );
}
