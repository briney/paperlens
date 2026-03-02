import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-utils";

export const POST = withErrorHandler(async () => {
  await clearAuthCookies();
  return NextResponse.json({ success: true });
});
