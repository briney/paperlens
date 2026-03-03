import { randomUUID } from "crypto";
import path from "path";

const MAX_DECODE_PASSES = 3;

function decodePathRecursively(value: string): string {
  let decoded = value;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) return next;
    decoded = next;
  }

  return decoded;
}

export function normalizeStoragePath(input: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("Storage path is required");
  }

  const decoded = decodePathRecursively(input);
  if (decoded.includes("\0")) {
    throw new Error("Storage path contains invalid null bytes");
  }

  const normalized = path.posix.normalize(decoded.replace(/\\/g, "/"));
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error("Storage path is invalid");
  }

  return normalized;
}

export function getUserPaperPrefix(userId: string): string {
  return `papers/${userId}/`;
}

export function isUserPaperPath(storagePath: string, userId: string): boolean {
  const normalized = normalizeStoragePath(storagePath);
  return normalized.startsWith(getUserPaperPrefix(userId));
}

export function createPaperStoragePath(userId: string): string {
  return `${getUserPaperPrefix(userId)}${Date.now()}-${randomUUID()}.pdf`;
}
