import { NextResponse } from "next/server";
import { getCurrentUser, type AuthUser } from "@/lib/auth";

type AdminCheck =
  | { user: AuthUser; error?: never }
  | { user?: never; error: NextResponse };

export async function requireAdmin(): Promise<AdminCheck> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}
