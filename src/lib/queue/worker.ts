import { Job, Worker } from "bullmq";
import type { JobStatus, Prisma } from "@prisma/client";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getAIProvider } from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/types";
import { resolveUrl, downloadPdf } from "@/lib/ingestion/url-resolver";
import { validatePdfBytes } from "@/lib/ingestion/pdf-validator";
import { getAnalyzer } from "@/lib/analyzers";
import { sanitizeProviderErrorText } from "@/lib/ai/error-sanitizer";
import { createPaperStoragePath } from "@/lib/storage/path";
import { paperQueue } from "./index";
import type {
  PaperJobName,
  FetchUrlJobData,
  ParsePdfJobData,
  RunAnalysisJobData,
} from "./index";

const PROCESSABLE_STATUSES: JobStatus[] = ["QUEUED", "PROCESSING", "FAILED"];

class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled`);
    this.name = "JobCancelledError";
  }
}

function isCancelledError(error: Error): boolean {
  return error.name === "JobCancelledError";
}

type IngestionJobStage = "PDF_RETRIEVAL" | "PDF_PARSING";

function buildIngestionJobConfig(
  stage: IngestionJobStage,
  parseModelSlug?: string,
  summaryModelSlug?: string
): Record<string, string> {
  const config: Record<string, string> = { stage };

  if (parseModelSlug) {
    config.parseModelSlug = parseModelSlug;
  }
  if (summaryModelSlug) {
    config.summaryModelSlug = summaryModelSlug;
  }

  return config;
}

function getQueueJobId(job: Job): string {
  if (typeof job.id !== "string") {
    throw new Error("Queue job has no string ID");
  }
  return job.id;
}

function getDbJobIdFromEvent(job: Job | undefined): string | null {
  if (!job) return null;
  if (job.name === "run-analysis") {
    const data = job.data as Partial<RunAnalysisJobData> | undefined;
    if (data && typeof data.jobId === "string") {
      return data.jobId;
    }
  }
  return typeof job.id === "string" ? job.id : null;
}

async function assertJobNotCancelled(jobId: string): Promise<void> {
  const existing = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });

  if (existing?.status === "CANCELLED") {
    throw new JobCancelledError(jobId);
  }
}

async function markJobProcessing(jobId: string): Promise<void> {
  const updated = await prisma.job.updateMany({
    where: {
      id: jobId,
      status: { in: PROCESSABLE_STATUSES },
    },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

  if (updated.count === 0) {
    await assertJobNotCancelled(jobId);
    throw new Error(`Job ${jobId} is not in a processable state`);
  }
}

async function markJobCompleted(
  jobId: string,
  result?: Prisma.InputJsonValue
): Promise<void> {
  const data: Prisma.JobUpdateManyMutationInput = {
    status: "COMPLETED",
    completedAt: new Date(),
  };
  if (result !== undefined) {
    data.result = result;
  }

  const updated = await prisma.job.updateMany({
    where: { id: jobId, status: { not: "CANCELLED" } },
    data,
  });

  if (updated.count === 0) {
    await assertJobNotCancelled(jobId);
    throw new Error(`Job ${jobId} could not be marked completed`);
  }
}

async function markJobFailed(jobId: string, errorMessage: string): Promise<void> {
  await prisma.job.updateMany({
    where: {
      id: jobId,
      status: { in: PROCESSABLE_STATUSES },
    },
    data: {
      status: "FAILED",
      error: errorMessage,
      completedAt: new Date(),
    },
  });
}

async function handleFetchUrl(job: Job<FetchUrlJobData>) {
  const { paperId, url, userId, parseModelSlug, summaryModelSlug } = job.data;
  const dbJobId = getQueueJobId(job);

  await markJobProcessing(dbJobId);
  await assertJobNotCancelled(dbJobId);

  // Resolve URL to a downloadable PDF URL
  const resolved = await resolveUrl(url);

  await assertJobNotCancelled(dbJobId);

  // Download the PDF
  const pdfBuffer = await downloadPdf(resolved.pdfUrl);

  // Validate the downloaded file
  const validation = validatePdfBytes(pdfBuffer);
  if (!validation.valid) {
    throw new Error(`Downloaded file is not a valid PDF: ${validation.error}`);
  }

  await assertJobNotCancelled(dbJobId);

  // Store in blob storage
  const storage = getStorage();
  const storagePath = createPaperStoragePath(userId);
  await storage.upload(storagePath, pdfBuffer, "application/pdf");

  // Update paper with storage path and source type
  await prisma.paper.update({
    where: { id: paperId },
    data: {
      storagePath,
      source: resolved.sourceType,
    },
  });

  await markJobCompleted(dbJobId);
  await assertJobNotCancelled(dbJobId);

  // Enqueue the parse-pdf follow-up job
  const parseJob = await prisma.job.create({
    data: {
      userId,
      paperId,
      type: "PARSE_PDF",
      status: "QUEUED",
      config: buildIngestionJobConfig("PDF_PARSING", parseModelSlug, summaryModelSlug),
    },
  });

  await paperQueue.add(
    "parse-pdf",
    { paperId, storagePath, userId, parseModelSlug, summaryModelSlug },
    { jobId: parseJob.id }
  );
}

async function handleParsePdf(job: Job<ParsePdfJobData>) {
  const { paperId, storagePath, userId, parseModelSlug, summaryModelSlug } = job.data;
  const dbJobId = getQueueJobId(job);

  await markJobProcessing(dbJobId);
  await assertJobNotCancelled(dbJobId);

  // Download PDF from storage
  const storage = getStorage();
  const pdfBuffer = await storage.download(storagePath);

  await assertJobNotCancelled(dbJobId);

  // Call AI provider to parse the document
  const provider = await getAIProvider();
  const result = await provider.parseDocument(pdfBuffer, {
    taskType: "PARSE_PDF",
    modelSlug: parseModelSlug,
  });

  await assertJobNotCancelled(dbJobId);

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

  await markJobCompleted(dbJobId, {
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });
  await assertJobNotCancelled(dbJobId);

  // Auto-enqueue summarization
  const summarizeJob = await prisma.job.create({
    data: {
      userId,
      paperId,
      type: "SUMMARIZE",
      status: "QUEUED",
      config: summaryModelSlug ? { modelSlug: summaryModelSlug } : undefined,
    },
  });

  await paperQueue.add(
    "run-analysis",
    {
      paperId,
      jobId: summarizeJob.id,
      analyzerType: "SUMMARIZE",
      modelSlug: summaryModelSlug,
      userId,
    },
    { jobId: summarizeJob.id }
  );
}

async function handleRunAnalysis(job: Job<RunAnalysisJobData>) {
  const { paperId, jobId, analyzerType, modelSlug, userId } = job.data;
  const dbJobId = jobId;

  await markJobProcessing(dbJobId);
  await assertJobNotCancelled(dbJobId);

  // Load analyzer from registry
  const analyzer = getAnalyzer(analyzerType);
  if (!analyzer) {
    throw new Error(`Unknown analyzer type: ${analyzerType}`);
  }

  // Load paper
  const paper = await prisma.paper.findUniqueOrThrow({
    where: { id: paperId },
  });

  if (!paper.markupPath) {
    throw new Error("Paper has no parsed markup yet");
  }

  // Load markup from storage
  const storage = getStorage();
  const markupBuffer = await storage.download(paper.markupPath);
  const markup = markupBuffer.toString("utf-8");

  await assertJobNotCancelled(dbJobId);

  // Get AI provider and execute analyzer
  const provider = await getAIProvider();
  const taskScopedProvider: AIProvider = {
    parseDocument: (pdfBuffer, options) =>
      provider.parseDocument(pdfBuffer, {
        ...options,
        taskType: options?.taskType ?? "PARSE_PDF",
      }),
    complete: (messages, options) =>
      provider.complete(messages, {
        ...options,
        taskType: options?.taskType ?? analyzer.taskType,
      }),
  };

  const result = await analyzer.execute({
    paper: {
      id: paper.id,
      title: paper.title,
      authors: paper.authors,
      metadata: paper.metadata as Record<string, unknown> | null,
    },
    markup,
    ai: taskScopedProvider,
    modelSlug,
  });

  await assertJobNotCancelled(dbJobId);

  // Store analysis content in blob storage
  const analysisPath = paper.markupPath.replace(/\.md$/, `-${analyzerType.toLowerCase()}.md`);
  await storage.upload(analysisPath, Buffer.from(result.content, "utf-8"), "text/markdown");

  // Create Analysis record
  await prisma.analysis.create({
    data: {
      paperId,
      jobId,
      type: analyzer.taskType,
      modelUsed: result.model,
      content: result.content,
      storagePath: analysisPath,
      tokenUsage: {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
      },
    },
  });

  // Create usage record
  await prisma.usageRecord.create({
    data: {
      userId,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cost: 0,
      jobType: analyzer.taskType,
    },
  });

  await markJobCompleted(dbJobId, {
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
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
        case "run-analysis":
          await handleRunAnalysis(job as Job<RunAnalysisJobData>);
          break;
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
    const dbJobId = getDbJobIdFromEvent(job);
    if (isCancelledError(err)) {
      console.log(`Job ${dbJobId ?? job?.id} (${job?.name}) cancelled`);
      return;
    }

    const sanitizedError = sanitizeProviderErrorText(err.message);
    console.error(`Job ${job?.id} (${job?.name}) failed:`, sanitizedError);
    if (!dbJobId) return;

    void markJobFailed(dbJobId, sanitizedError).catch((error: Error) =>
      console.error("Failed to update job status:", error.message)
    );
  });

  return worker;
}
