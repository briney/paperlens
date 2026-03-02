import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  const body = await request.json();

  // If setting as default, unset others in same category within a transaction
  if (body.isDefault === true) {
    const existing = await prisma.modelConfig.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const category = body.category ?? existing.category;

    const model = await prisma.$transaction(async (tx) => {
      await tx.modelConfig.updateMany({
        where: { category, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      return tx.modelConfig.update({ where: { id }, data: body });
    });

    return NextResponse.json(model);
  }

  const model = await prisma.modelConfig.update({
    where: { id },
    data: body,
  });

  return NextResponse.json(model);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;

  await prisma.modelConfig.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
