import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidEmail, isValidPassword } from "@/lib/validation";
import { hashPassword } from "@/lib/auth/password";

export const GET = withErrorHandler(async () => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      approvalStatus: true,
      createdAt: true,
      _count: { select: { papers: true, jobs: true } },
      quota: { select: { tier: true } },
    },
  });

  return NextResponse.json(users);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  let body: { email?: string; password?: string; name?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const role = body.role === "ADMIN" ? "ADMIN" : "USER";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true },
  });

  const passwordHash = await hashPassword(password);
  const approvedAt = new Date();

  if (existing && !existing.deletedAt) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  if (existing?.deletedAt) {
    const restored = await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        name,
        role,
        isActive: true,
        approvalStatus: "APPROVED",
        approvedAt,
        approvedById: check.user.id,
        deletedAt: null,
        deletedById: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        approvalStatus: true,
        createdAt: true,
      },
    });
    return NextResponse.json(restored);
  }

  const created = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role,
      approvalStatus: "APPROVED",
      approvedAt,
      approvedById: check.user.id,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      approvalStatus: true,
      createdAt: true,
    },
  });

  return NextResponse.json(created, { status: 201 });
});
