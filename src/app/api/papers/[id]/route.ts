import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const paper = await prisma.paper.findFirst({
    where: { id, userId: user.id },
    include: {
      jobs: { orderBy: { createdAt: "desc" } },
      analyses: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  return NextResponse.json({ paper });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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
    await storage.delete(paper.storagePath).catch(() => {});
  }
  if (paper.markupPath) {
    await storage.delete(paper.markupPath).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
