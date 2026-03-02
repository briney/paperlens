import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-utils";
import { isValidEmail, isValidPassword } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export const POST = withErrorHandler(async (req: NextRequest) => {
  const limited = await rateLimit(req, "auth:register", { windowSeconds: 3600, maxRequests: 5 });
  if (limited) return limited;

  const body = await req.json();
  const { email, password, name } = body;

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

  if (!isValidPassword(password)) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters" },
      { status: 400 }
    );
  }

  try {
    const user = await registerUser(email, password, name);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "A user with this email already exists") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
});
