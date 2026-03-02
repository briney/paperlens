import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paperQueue } from "@/lib/queue";
import { getStorage } from "@/lib/storage";
import { validatePdfBytes, getMaxUploadSizeMB } from "@/lib/ingestion/pdf-validator";
import { withErrorHandler } from "@/lib/api-utils";
import { isAllowedPaperUrl } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

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

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const validation = validatePdfBytes(buffer);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Store the PDF
  const storage = getStorage();
  const storagePath = `papers/${userId}/${Date.now()}-${file.name}`;
  await storage.upload(storagePath, buffer, "application/pdf");

  // Create paper record
  const paper = await prisma.paper.create({
    data: {
      userId,
      source: "UPLOAD",
      storagePath,
      title: file.name.replace(/\.pdf$/i, ""),
    },
  });

  // Create job record
  const job = await prisma.job.create({
    data: {
      userId,
      paperId: paper.id,
      type: "PARSE_PDF",
      status: "QUEUED",
    },
  });

  // Enqueue parse job
  await paperQueue.add("parse-pdf", {
    paperId: paper.id,
    storagePath,
    userId,
  }, { jobId: job.id });

  return NextResponse.json({ paper, job }, { status: 201 });
}

async function handleUrlSubmission(request: NextRequest, userId: string) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!isAllowedPaperUrl(url)) {
    return NextResponse.json(
      { error: "URL domain is not in the allowed list. Supported sources include arXiv, bioRxiv, Nature, Science, PubMed, and other major publishers." },
      { status: 400 }
    );
  }

  // Determine source type: if URL ends with .pdf, it's a direct PDF URL
  const source = url.toLowerCase().endsWith(".pdf") ? "PDF_URL" : "PAGE_URL";

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
    },
  });

  // Enqueue fetch-url job (which will then enqueue parse-pdf after download)
  await paperQueue.add("fetch-url", {
    paperId: paper.id,
    url,
    userId,
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
