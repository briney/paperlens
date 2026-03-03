import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidCuid } from "@/lib/validation";

const VALID_ROLES = new Set(["USER", "ADMIN"]);
const VALID_APPROVAL = new Set(["PENDING", "APPROVED", "REJECTED"]);

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, role: true, isActive: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (typeof body.role === "string") {
    if (!VALID_ROLES.has(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    if (id === check.user.id && body.role !== check.user.role) {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 }
      );
    }

    if (target.role === "ADMIN" && body.role !== "ADMIN" && target.isActive) {
      const activeAdminCount = await prisma.user.count({
        where: { role: "ADMIN", isActive: true, deletedAt: null },
      });
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot demote the last active admin" },
          { status: 400 }
        );
      }
    }

    data.role = body.role;
  }

  if (typeof body.isActive === "boolean") {
    if (id === check.user.id && body.isActive === false) {
      return NextResponse.json(
        { error: "Cannot deactivate your own account" },
        { status: 400 }
      );
    }

    if (target.role === "ADMIN" && body.isActive === false && target.isActive) {
      const activeAdminCount = await prisma.user.count({
        where: { role: "ADMIN", isActive: true, deletedAt: null },
      });
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot deactivate the last active admin" },
          { status: 400 }
        );
      }
    }

    data.isActive = body.isActive;
  }

  if (typeof body.approvalStatus === "string") {
    if (!VALID_APPROVAL.has(body.approvalStatus)) {
      return NextResponse.json(
        { error: "Invalid approval status" },
        { status: 400 }
      );
    }

    data.approvalStatus = body.approvalStatus;
    if (body.approvalStatus === "APPROVED") {
      data.approvedAt = new Date();
      data.approvedById = check.user.id;
    } else if (body.approvalStatus === "REJECTED") {
      data.approvedAt = null;
      data.approvedById = check.user.id;
    } else {
      data.approvedAt = null;
      data.approvedById = null;
    }
  }

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    data.name = trimmed.length > 0 ? trimmed : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      approvalStatus: true,
      approvedAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(user);
});

export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> }
) => {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  if (typeof id !== "string" || !isValidCuid(id)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  if (id === check.user.id) {
    return NextResponse.json(
      { error: "Cannot remove your own account" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, role: true, isActive: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "ADMIN" && target.isActive) {
    const activeAdminCount = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, deletedAt: null },
    });
    if (activeAdminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last active admin" },
        { status: 400 }
      );
    }
  }

  await prisma.user.update({
    where: { id },
    data: {
      isActive: false,
      approvalStatus: "REJECTED",
      approvedAt: null,
      deletedAt: new Date(),
      deletedById: check.user.id,
    },
  });

  return NextResponse.json({ success: true });
});
