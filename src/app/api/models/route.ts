import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-utils";
import {
  listCompatibleModelsForTask,
  parseTaskType,
  ModelRoutingError,
} from "@/lib/ai/model-routing";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const taskType = parseTaskType(request.nextUrl.searchParams.get("taskType")) ?? "SUMMARIZE";

  try {
    const models = await listCompatibleModelsForTask(taskType);
    return NextResponse.json({ models, taskType });
  } catch (error) {
    if (error instanceof ModelRoutingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
});
