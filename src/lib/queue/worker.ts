import { Worker, Job } from "bullmq";
import { redis } from "@/lib/redis";
import type {
  PaperJobName,
  FetchUrlJobData,
  ParsePdfJobData,
  RunAnalysisJobData,
} from "./index";

export function createPaperWorker() {
  const worker = new Worker(
    "paper-processing",
    async (job: Job) => {
      const name = job.name as PaperJobName;

      switch (name) {
        case "fetch-url": {
          const _data = job.data as FetchUrlJobData;
          // TODO (Phase 2): Implement URL fetching
          throw new Error("fetch-url not yet implemented");
        }
        case "parse-pdf": {
          const _data = job.data as ParsePdfJobData;
          // TODO (Phase 2): Implement PDF parsing via AI provider
          throw new Error("parse-pdf not yet implemented");
        }
        case "run-analysis": {
          const _data = job.data as RunAnalysisJobData;
          // TODO (Phase 3): Implement analysis execution
          throw new Error("run-analysis not yet implemented");
        }
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    },
    {
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} (${job.name}) completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  return worker;
}
