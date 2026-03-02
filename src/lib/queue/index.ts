import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

export const paperQueue = new Queue("paper-processing", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export type PaperJobName = "fetch-url" | "parse-pdf" | "run-analysis";

export interface FetchUrlJobData {
  paperId: string;
  url: string;
  userId: string;
  parseModelSlug?: string;
  summaryModelSlug?: string;
}

export interface ParsePdfJobData {
  paperId: string;
  storagePath: string;
  userId: string;
  parseModelSlug?: string;
  summaryModelSlug?: string;
}

export interface RunAnalysisJobData {
  paperId: string;
  jobId: string;
  analyzerType: string;
  modelSlug?: string;
  userId: string;
}

export type PaperJobData =
  | FetchUrlJobData
  | ParsePdfJobData
  | RunAnalysisJobData;
