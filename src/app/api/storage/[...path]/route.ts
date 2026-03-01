import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const storagePath = decodeURIComponent(path.join("/"));

  // Only allow users to access their own files
  if (!storagePath.includes(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storage = getStorage();
  const exists = await storage.exists(storagePath);
  if (!exists) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const data = await storage.download(storagePath);

  // Determine content type from path
  let contentType = "application/octet-stream";
  if (storagePath.endsWith(".pdf")) contentType = "application/pdf";
  else if (storagePath.endsWith(".md")) contentType = "text/markdown";
  else if (storagePath.endsWith(".txt")) contentType = "text/plain";

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": data.length.toString(),
    },
  });
}
