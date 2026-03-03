import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";

export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [models, allowlist] = await Promise.all([
    prisma.modelConfig.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: {
        slug: true,
        displayName: true,
        category: true,
      },
    }),
    prisma.userModelAllowlist.findMany({
      where: { userId: id },
      select: { modelSlug: true },
      orderBy: { modelSlug: "asc" },
    }),
  ]);

  return NextResponse.json({
    models,
    allowedModelSlugs: allowlist.map((entry) => entry.modelSlug),
  });
});

export const PUT = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: { allowedModelSlugs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.allowedModelSlugs)) {
    return NextResponse.json(
      { error: "allowedModelSlugs must be an array" },
      { status: 400 }
    );
  }

  const allowedModelSlugs = [...new Set(
    body.allowedModelSlugs
      .filter((slug): slug is string => typeof slug === "string")
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0)
  )];

  if (allowedModelSlugs.length > 0) {
    const activeModels = await prisma.modelConfig.findMany({
      where: { slug: { in: allowedModelSlugs }, isActive: true },
      select: { slug: true },
    });
    const activeSlugs = new Set(activeModels.map((model) => model.slug));
    const invalid = allowedModelSlugs.filter((slug) => !activeSlugs.has(slug));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown or inactive model slug(s): ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.userModelAllowlist.deleteMany({ where: { userId: id } });

    if (allowedModelSlugs.length > 0) {
      await tx.userModelAllowlist.createMany({
        data: allowedModelSlugs.map((modelSlug) => ({
          userId: id,
          modelSlug,
          createdById: check.user.id,
        })),
      });
    }
  });

  return NextResponse.json({ allowedModelSlugs });
});
