import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";

export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid paper ID" }, { status: 400 });
  }

  const paper = await prisma.paper.findFirst({
    where: { id, userId: user.id },
    include: {
      jobs: { where: { isArchivedByAdmin: false }, orderBy: { createdAt: "desc" } },
      analyses: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  return NextResponse.json({ paper });
});

export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid paper ID" }, { status: 400 });
  }

  const paper = await prisma.paper.findFirst({
    where: { id, userId: user.id },
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  // Delete associated records first (analyses, jobs), then paper
  await prisma.analysis.deleteMany({ where: { paperId: id } });
  await prisma.job.deleteMany({ where: { paperId: id } });
  await prisma.paper.delete({ where: { id } });

  // Clean up storage
  const storage = getStorage();
  if (paper.storagePath) {
    await storage.delete(paper.storagePath).catch((err) => console.error("Failed to delete storage file:", err));
  }
  if (paper.markupPath) {
    await storage.delete(paper.markupPath).catch((err) => console.error("Failed to delete markup file:", err));
  }

  const metadata = paper.metadata && typeof paper.metadata === "object" && !Array.isArray(paper.metadata)
    ? paper.metadata as Record<string, unknown>
    : null;
  const parseArtifacts = metadata?.parseArtifacts;
  const figureAssetPaths = parseArtifacts
    && typeof parseArtifacts === "object"
    && !Array.isArray(parseArtifacts)
    && Array.isArray((parseArtifacts as Record<string, unknown>).figureAssetPaths)
      ? (parseArtifacts as { figureAssetPaths: unknown[] }).figureAssetPaths
      : [];

  for (const assetPath of figureAssetPaths) {
    if (typeof assetPath !== "string" || assetPath.trim().length === 0) continue;
    await storage.delete(assetPath).catch((err) =>
      console.error("Failed to delete parsed figure asset:", err)
    );
  }

  return NextResponse.json({ success: true });
});
