import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paperQueue } from "@/lib/queue";
import { getStorage } from "@/lib/storage";
import { validatePdfBytes } from "@/lib/ingestion/pdf-validator";
import { withErrorHandler } from "@/lib/api-utils";
import { isAllowedPaperUrl } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { ModelRoutingError, resolveTaskModel } from "@/lib/ai/model-routing";
import { createPaperStoragePath } from "@/lib/storage/path";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(request, "papers:create", { windowSeconds: 60, maxRequests: 5 });
  if (limited) return limited;

  const contentType = request.headers.get("content-type") ?? "";

  // URL submission (JSON body)
  if (contentType.includes("application/json")) {
    return handleUrlSubmission(request, user.id);
  }

  // PDF upload (multipart form data)
  if (contentType.includes("multipart/form-data")) {
    return handlePdfUpload(request, user.id);
  }

  return NextResponse.json(
    { error: "Unsupported content type. Use multipart/form-data for PDF upload or application/json for URL submission." },
    { status: 400 }
  );
});

async function handlePdfUpload(request: NextRequest, userId: string) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
  }

  const originalFilename = file.name.split(/[\\/]/).pop() ?? "paper.pdf";

  if (!originalFilename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
  }

  const parseModelSlug = toOptionalString(formData.get("parseModelSlug"));
  const summaryModelSlug = toOptionalString(formData.get("summaryModelSlug"));

  try {
    if (parseModelSlug) {
      await resolveTaskModel({ taskType: "PARSE_PDF", requestedModelSlug: parseModelSlug });
    }
    if (summaryModelSlug) {
      await resolveTaskModel({ taskType: "SUMMARIZE", requestedModelSlug: summaryModelSlug });
    }
  } catch (error) {
    if (error instanceof ModelRoutingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const validation = validatePdfBytes(buffer);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Store the PDF
  const storage = getStorage();
  const storagePath = createPaperStoragePath(userId);
  await storage.upload(storagePath, buffer, "application/pdf");

  // Create paper record
  const paper = await prisma.paper.create({
    data: {
      userId,
      source: "UPLOAD",
      storagePath,
      title: originalFilename.replace(/\.pdf$/i, ""),
    },
  });

  // Create job record
  const job = await prisma.job.create({
    data: {
      userId,
      paperId: paper.id,
      type: "PARSE_PDF",
      status: "QUEUED",
      config: parseModelSlug || summaryModelSlug
        ? { parseModelSlug, summaryModelSlug }
        : undefined,
    },
  });

  // Enqueue parse job
  await paperQueue.add("parse-pdf", {
    paperId: paper.id,
    storagePath,
    userId,
    parseModelSlug,
    summaryModelSlug,
  }, { jobId: job.id });

  return NextResponse.json({ paper, job }, { status: 201 });
}

async function handleUrlSubmission(request: NextRequest, userId: string) {
  let body: { url?: string; parseModelSlug?: string; summaryModelSlug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = body.url;
  const parseModelSlug = normalizeOptionalString(body.parseModelSlug);
  const summaryModelSlug = normalizeOptionalString(body.summaryModelSlug);
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Basic URL validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTP(S) URLs are supported" }, { status: 400 });
  }

  if (!isAllowedPaperUrl(url)) {
    return NextResponse.json(
      { error: "URL domain is not in the allowed list. Supported sources include arXiv, bioRxiv, Nature, Science, PubMed, and other major publishers." },
      { status: 400 }
    );
  }

  try {
    if (parseModelSlug) {
      await resolveTaskModel({ taskType: "PARSE_PDF", requestedModelSlug: parseModelSlug });
    }
    if (summaryModelSlug) {
      await resolveTaskModel({ taskType: "SUMMARIZE", requestedModelSlug: summaryModelSlug });
    }
  } catch (error) {
    if (error instanceof ModelRoutingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  // Determine source type: if URL ends with .pdf, it's a direct PDF URL
  const source = parsedUrl.pathname.toLowerCase().endsWith(".pdf") ? "PDF_URL" : "PAGE_URL";

  // Create paper record with placeholder storage path (will be updated by worker)
  const paper = await prisma.paper.create({
    data: {
      userId,
      source: source as "PDF_URL" | "PAGE_URL",
      sourceUrl: url,
      storagePath: "", // Will be set by fetch-url worker
    },
  });

  // Create job record
  const job = await prisma.job.create({
    data: {
      userId,
      paperId: paper.id,
      type: "PARSE_PDF",
      status: "QUEUED",
      config: parseModelSlug || summaryModelSlug
        ? { parseModelSlug, summaryModelSlug }
        : undefined,
    },
  });

  // Enqueue fetch-url job (which will then enqueue parse-pdf after download)
  await paperQueue.add("fetch-url", {
    paperId: paper.id,
    url,
    userId,
    parseModelSlug,
    summaryModelSlug,
  }, { jobId: job.id });

  return NextResponse.json({ paper, job }, { status: 201 });
}

export const GET = withErrorHandler(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const papers = await prisma.paper.findMany({
    where: { userId: user.id },
    include: {
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ papers });
});

function toOptionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  return normalizeOptionalString(value);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
