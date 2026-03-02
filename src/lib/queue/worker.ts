import { Worker, Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getAIProvider } from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/types";
import { resolveUrl, downloadPdf } from "@/lib/ingestion/url-resolver";
import { validatePdfBytes } from "@/lib/ingestion/pdf-validator";
import { getAnalyzer } from "@/lib/analyzers";
import { sanitizeProviderErrorText } from "@/lib/ai/error-sanitizer";
import { paperQueue } from "./index";
import type {
  PaperJobName,
  FetchUrlJobData,
  ParsePdfJobData,
  RunAnalysisJobData,
} from "./index";

async function handleFetchUrl(job: Job<FetchUrlJobData>) {
  const { paperId, url, userId, parseModelSlug, summaryModelSlug } = job.data;

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
      config: parseModelSlug || summaryModelSlug
        ? { parseModelSlug, summaryModelSlug }
        : undefined,
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
  const result = await provider.parseDocument(pdfBuffer, {
    taskType: "PARSE_PDF",
    modelSlug: parseModelSlug,
  });

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

  // Mark job as processing
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

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

  // Mark job as completed
  await prisma.job.update({
    where: { id: jobId },
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
    const sanitizedError = sanitizeProviderErrorText(err.message);
    console.error(`Job ${job?.id} (${job?.name}) failed:`, sanitizedError);
    // Update job status to FAILED in DB
    if (job?.id) {
      prisma.job
        .update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: sanitizedError,
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
