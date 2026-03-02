"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import { toast } from "sonner";

interface JobActionsProps {
  jobId: string;
  status: string;
}

export function JobActions({ jobId, status }: JobActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (status !== "QUEUED" && status !== "PROCESSING") {
    return null;
  }

  async function cancelJob() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to cancel job");
        return;
      }
      toast.success("Job cancelled");
      router.refresh();
    } catch {
      toast.error("Failed to cancel job");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cancelJob}
      disabled={loading}
      className="text-destructive hover:text-destructive"
    >
      <XCircle className="mr-1 h-3.5 w-3.5" />
      Cancel
    </Button>
  );
}
