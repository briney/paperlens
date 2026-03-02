import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidEmail } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export const POST = withErrorHandler(async (req: NextRequest) => {
  const limited = await rateLimit(req, "auth:login", { windowSeconds: 900, maxRequests: 10 });
  if (limited) return limited;

  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  const user = await loginUser(email, password);
  return NextResponse.json({ user });
});
