import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/auth/jwt";

// Routes that require authentication
const PROTECTED_PATTERNS = ["/dashboard", "/upload", "/papers", "/settings"];
const ADMIN_PATTERNS = ["/admin"];
const AUTH_PAGES = ["/login", "/register"];

function matchesPatterns(pathname: string, patterns: string[]): boolean {
  return patterns.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip API routes, static files, etc.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const accessToken = req.cookies.get("access_token")?.value;
  const refreshToken = req.cookies.get("refresh_token")?.value;

  let payload: { userId: string; role: string } | null = null;

  if (accessToken) {
    try {
      payload = verifyAccessToken(accessToken);
    } catch {
      // expired, try refresh
    }
  }

  if (!payload && refreshToken) {
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      // also expired
    }
  }

  // Redirect authenticated users away from auth pages
  if (payload && matchesPatterns(pathname, AUTH_PAGES)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Protect authenticated routes
  if (!payload && matchesPatterns(pathname, PROTECTED_PATTERNS)) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Protect admin routes
  if (matchesPatterns(pathname, ADMIN_PATTERNS)) {
    if (!payload) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (payload.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // Attach user info to headers for downstream use
  if (payload) {
    const headers = new Headers(req.headers);
    headers.set("x-user-id", payload.userId);
    headers.set("x-user-role", payload.role);
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
