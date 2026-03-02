import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> }
) => Promise<NextResponse> | NextResponse;

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return NextResponse.json(
            { error: "Resource not found" },
            { status: 404 }
          );
        }
        if (error.code === "P2002") {
          return NextResponse.json(
            { error: "Resource already exists" },
            { status: 409 }
          );
        }
      }

      console.error("API error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
