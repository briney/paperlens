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

  // Prevent self-deactivation
  if (id === check.user.id && body.isActive === false) {
    return NextResponse.json(
      { error: "Cannot deactivate your own account" },
      { status: 400 }
    );
  }

  // Prevent self-role-change
  if (id === check.user.id && body.role && body.role !== check.user.role) {
    return NextResponse.json(
      { error: "Cannot change your own role" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (typeof body.role === "string") data.role = body.role;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  return NextResponse.json(user);
}
