import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paperQueue } from "@/lib/queue";
import { getAnalyzer } from "@/lib/analyzers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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
    const model = await prisma.modelConfig.findFirst({
      where: { slug: modelSlug, isActive: true, category: "CHAT_COMPLETION" },
    });
    if (!model) {
      return NextResponse.json({ error: "Invalid or inactive model" }, { status: 400 });
    }
  }

  // Create job record
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      paperId: id,
      type: analyzerType as "SUMMARIZE",
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
}
