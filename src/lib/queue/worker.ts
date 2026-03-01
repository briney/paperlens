import { Worker, Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getAIProvider } from "@/lib/ai/provider";
import { resolveUrl, downloadPdf } from "@/lib/ingestion/url-resolver";
import { validatePdfBytes } from "@/lib/ingestion/pdf-validator";
import { paperQueue } from "./index";
import type {
  PaperJobName,
  FetchUrlJobData,
  ParsePdfJobData,
  RunAnalysisJobData,
} from "./index";

async function handleFetchUrl(job: Job<FetchUrlJobData>) {
  const { paperId, url, userId } = job.data;

  // Mark job as processing
  await prisma.job.update({
    where: { id: job.id! },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

  // Resolve URL to a downloadable PDF URL
  const resolved = await resolveUrl(url);

  // Download the PDF
  const pdfBuffer = await downloadPdf(resolved.pdfUrl);

  // Validate the downloaded file
  const validation = validatePdfBytes(pdfBuffer);
  if (!validation.valid) {
    throw new Error(`Downloaded file is not a valid PDF: ${validation.error}`);
  }

  // Store in blob storage
  const storage = getStorage();
  const filename = `${Date.now()}.pdf`;
  const storagePath = `papers/${userId}/${filename}`;
  await storage.upload(storagePath, pdfBuffer, "application/pdf");

  // Update paper with storage path and source type
  await prisma.paper.update({
    where: { id: paperId },
    data: {
      storagePath,
      source: resolved.sourceType,
    },
  });

  // Mark this fetch job as completed
  await prisma.job.update({
    where: { id: job.id! },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  // Enqueue the parse-pdf follow-up job
  const parseJob = await prisma.job.create({
    data: {
      userId,
      paperId,
      type: "PARSE_PDF",
      status: "QUEUED",
    },
  });

  await paperQueue.add(
    "parse-pdf",
    { paperId, storagePath, userId },
    { jobId: parseJob.id }
  );
}

async function handleParsePdf(job: Job<ParsePdfJobData>) {
  const { paperId, storagePath, userId } = job.data;

  // Mark job as processing
  await prisma.job.update({
    where: { id: job.id! },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

  // Download PDF from storage
  const storage = getStorage();
  const pdfBuffer = await storage.download(storagePath);

  // Call AI provider to parse the document
  const provider = await getAIProvider();
  const result = await provider.parseDocument(pdfBuffer);

  // Store parsed markup in storage
  const markupPath = storagePath.replace(/\.pdf$/, ".md");
  await storage.upload(markupPath, Buffer.from(result.markup, "utf-8"), "text/markdown");

  // Update paper record with parsed data
  await prisma.paper.update({
    where: { id: paperId },
    data: {
      markupPath,
      title: result.title ?? undefined,
      authors: result.authors ?? undefined,
      metadata: (result.metadata as Record<string, string>) ?? undefined,
    },
  });

  // Create usage record for token tracking
  await prisma.usageRecord.create({
    data: {
      userId,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cost: 0, // Cost calculation deferred to admin config
      jobType: "PARSE_PDF",
    },
  });

  // Mark job as completed
  await prisma.job.update({
    where: { id: job.id! },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      result: {
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    },
  });
}

export function createPaperWorker() {
  const worker = new Worker(
    "paper-processing",
    async (job: Job) => {
      const name = job.name as PaperJobName;

      switch (name) {
        case "fetch-url":
          await handleFetchUrl(job as Job<FetchUrlJobData>);
          break;
        case "parse-pdf":
          await handleParsePdf(job as Job<ParsePdfJobData>);
          break;
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
    // Update job status to FAILED in DB
    if (job?.id) {
      prisma.job
        .update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: err.message,
            completedAt: new Date(),
          },
        })
        .catch((e: Error) =>
          console.error("Failed to update job status:", e.message)
        );
    }
  });

  return worker;
}
