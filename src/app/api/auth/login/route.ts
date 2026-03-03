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

  try {
    const user = await loginUser(email, password);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Invalid email or password") {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.message === "Account is deactivated") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message === "Account has been removed") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error; // re-throw unexpected errors to withErrorHandler
  }
});
