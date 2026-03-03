"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

type PaperSource = "UPLOAD" | "PDF_URL" | "PAGE_URL";
type IngestionJobStage = "PDF_RETRIEVAL" | "PDF_PARSING";

interface Job {
  id: string;
  type: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  config?: unknown;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

interface JobStatusPollerProps {
  paperId: string;
  paperSource: PaperSource;
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
  SUMMARIZE: "Summarization",
  PEER_REVIEW: "Peer Review",
  CLAIM_VERIFY: "Claim Verification",
  JOURNAL_CLUB: "Journal Club",
  NOVELTY_ASSESS: "Novelty Assessment",
  CUSTOM: "Custom Analysis",
};

function getIngestionStage(config: unknown): IngestionJobStage | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const stage = (config as Record<string, unknown>).stage;
  if (stage === "PDF_RETRIEVAL" || stage === "PDF_PARSING") {
    return stage;
  }

  return null;
}

function getFallbackRetrievalJobId(jobs: Job[], paperSource: PaperSource): string | null {
  if (paperSource !== "PDF_URL" && paperSource !== "PAGE_URL") {
    return null;
  }

  const parseJobs = jobs
    .filter((job) => job.type === "PARSE_PDF")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  return parseJobs[0]?.id ?? null;
}

function getJobLabel(job: Job, fallbackRetrievalJobId: string | null): string {
  if (job.type !== "PARSE_PDF") {
    return JOB_TYPE_LABELS[job.type] ?? job.type;
  }

  const stage = getIngestionStage(job.config);
  if (stage === "PDF_RETRIEVAL") {
    return "PDF Retrieval";
  }
  if (stage === "PDF_PARSING") {
    return "PDF Parsing";
  }

  if (fallbackRetrievalJobId && job.id === fallbackRetrievalJobId) {
    return "PDF Retrieval";
  }

  return "PDF Parsing";
}

export function JobStatusPoller({ paperId, paperSource, initialJobs }: JobStatusPollerProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const prevStatusesRef = useRef<Record<string, string>>({});

  // Initialize previous statuses from initial jobs
  useEffect(() => {
    const statuses: Record<string, string> = {};
    for (const job of initialJobs) {
      statuses[job.id] = job.status;
    }
    prevStatusesRef.current = statuses;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActiveJobs = jobs.some(
    (j) => j.status === "QUEUED" || j.status === "PROCESSING"
  );

  const pollJobs = useCallback(async () => {
    try {
      const response = await fetch(`/api/papers/${paperId}/jobs`);
      if (!response.ok) return;
      const data = await response.json();
      const newJobs = data.jobs as Job[];
      const fallbackRetrievalJobId = getFallbackRetrievalJobId(newJobs, paperSource);

      // Check for status transitions and fire toasts
      for (const job of newJobs) {
        const prevStatus = prevStatusesRef.current[job.id];
        if (prevStatus && prevStatus !== job.status) {
          const label = getJobLabel(job, fallbackRetrievalJobId);
          if (job.status === "COMPLETED") {
            toast.success(`${label} complete`);
          } else if (job.status === "FAILED") {
            toast.error(`${label} failed`, {
              description: job.error ?? undefined,
            });
          }
        }
      }

      // Update previous statuses
      const statuses: Record<string, string> = {};
      for (const job of newJobs) {
        statuses[job.id] = job.status;
      }
      prevStatusesRef.current = statuses;

      setJobs(newJobs);

      // Check if all jobs just completed
      const allDone = newJobs.every(
        (j) => j.status === "COMPLETED" || j.status === "FAILED" || j.status === "CANCELLED"
      );
      if (allDone && hasActiveJobs) {
        // Refresh the page to get updated paper data
        router.refresh();
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [paperId, paperSource, hasActiveJobs, router]);

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

  const fallbackRetrievalJobId = getFallbackRetrievalJobId(jobs, paperSource);

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
                  {getJobLabel(job, fallbackRetrievalJobId)}
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
