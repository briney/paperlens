import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type");

  if (!type || !["summary", "markup"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid type. Must be 'summary' or 'markup'." },
      { status: 400 }
    );
  }

  const paper = await prisma.paper.findFirst({
    where: { id, userId: user.id },
    include: {
      analyses: {
        where: { type: "SUMMARIZE" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  const storage = getStorage();
  let content: string;
  let filename: string;

  const safeTitle = (paper.title ?? "paper").replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50).trim();

  if (type === "markup") {
    if (!paper.markupPath) {
      return NextResponse.json({ error: "No markup available" }, { status: 404 });
    }
    const buffer = await storage.download(paper.markupPath);
    content = buffer.toString("utf-8");
    filename = `${safeTitle}-markup.md`;
  } else {
    const analysis = paper.analyses[0];
    if (!analysis) {
      return NextResponse.json({ error: "No summary available" }, { status: 404 });
    }
    content = analysis.content;
    filename = `${safeTitle}-summary.md`;
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
