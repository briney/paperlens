"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

interface Job {
  id: string;
  type: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

interface JobStatusPollerProps {
  paperId: string;
  initialJobs: Job[];
}

const STATUS_CONFIG = {
  QUEUED: {
    variant: "secondary" as const,
    icon: Clock,
    label: "Queued",
  },
  PROCESSING: {
    variant: "default" as const,
    icon: Loader2,
    label: "Processing",
  },
  COMPLETED: {
    variant: "default" as const,
    icon: CheckCircle2,
    label: "Completed",
  },
  FAILED: {
    variant: "destructive" as const,
    icon: XCircle,
    label: "Failed",
  },
  CANCELLED: {
    variant: "secondary" as const,
    icon: XCircle,
    label: "Cancelled",
  },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  PARSE_PDF: "PDF Parsing",
  SUMMARIZE: "Summarization",
  PEER_REVIEW: "Peer Review",
  CLAIM_VERIFY: "Claim Verification",
  JOURNAL_CLUB: "Journal Club",
  NOVELTY_ASSESS: "Novelty Assessment",
  CUSTOM: "Custom Analysis",
};

export function JobStatusPoller({ paperId, initialJobs }: JobStatusPollerProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);

  const hasActiveJobs = jobs.some(
    (j) => j.status === "QUEUED" || j.status === "PROCESSING"
  );

  const pollJobs = useCallback(async () => {
    try {
      const response = await fetch(`/api/papers/${paperId}/jobs`);
      if (!response.ok) return;
      const data = await response.json();
      setJobs(data.jobs);

      // Check if all jobs just completed
      const allDone = (data.jobs as Job[]).every(
        (j) => j.status === "COMPLETED" || j.status === "FAILED" || j.status === "CANCELLED"
      );
      if (allDone && hasActiveJobs) {
        // Refresh the page to get updated paper data
        router.refresh();
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [paperId, hasActiveJobs, router]);

  useEffect(() => {
    if (!hasActiveJobs) return;

    const interval = setInterval(pollJobs, 3000);
    return () => clearInterval(interval);
  }, [hasActiveJobs, pollJobs]);

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No jobs for this paper.</p>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const config = STATUS_CONFIG[job.status];
        const Icon = config.icon;
        const isSpinning = job.status === "PROCESSING";

        return (
          <div
            key={job.id}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <Icon
                className={`h-4 w-4 ${isSpinning ? "animate-spin" : ""} ${
                  job.status === "COMPLETED"
                    ? "text-green-600"
                    : job.status === "FAILED"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              />
              <div>
                <p className="text-sm font-medium">
                  {JOB_TYPE_LABELS[job.type] ?? job.type}
                </p>
                {job.error && (
                  <p className="text-xs text-destructive mt-0.5">{job.error}</p>
                )}
              </div>
            </div>
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
        );
      })}
    </div>
  );
}
