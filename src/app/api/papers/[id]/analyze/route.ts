import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paperQueue } from "@/lib/queue";
import { getAnalyzer } from "@/lib/analyzers";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { ModelRoutingError, resolveTaskModel } from "@/lib/ai/model-routing";

export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(request, "papers:analyze", { windowSeconds: 60, maxRequests: 5 });
  if (limited) return limited;

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid paper ID" }, { status: 400 });
  }

  let body: { analyzerType?: string; modelSlug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { analyzerType, modelSlug } = body;

  if (!analyzerType || typeof analyzerType !== "string") {
    return NextResponse.json({ error: "analyzerType is required" }, { status: 400 });
  }

  // Validate analyzer type
  const analyzer = getAnalyzer(analyzerType);
  if (!analyzer) {
    return NextResponse.json({ error: `Unknown analyzer type: ${analyzerType}` }, { status: 400 });
  }

  // Validate paper ownership and that markup exists
  const paper = await prisma.paper.findFirst({
    where: { id, userId: user.id },
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  if (!paper.markupPath) {
    return NextResponse.json(
      { error: "Paper has not been parsed yet. Wait for parsing to complete." },
      { status: 400 }
    );
  }

  // Validate model if specified
  if (modelSlug) {
    try {
      await resolveTaskModel({
        taskType: analyzer.taskType,
        requestedModelSlug: modelSlug,
      });
    } catch (error) {
      if (error instanceof ModelRoutingError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      throw error;
    }
  }

  // Create job record
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      paperId: id,
      type: analyzer.taskType,
      status: "QUEUED",
      config: modelSlug ? { modelSlug } : undefined,
    },
  });

  // Enqueue analysis job
  await paperQueue.add(
    "run-analysis",
    {
      paperId: id,
      jobId: job.id,
      analyzerType,
      modelSlug,
      userId: user.id,
    },
    { jobId: job.id }
  );

  return NextResponse.json({ job }, { status: 201 });
});
