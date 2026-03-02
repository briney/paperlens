import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

interface RateLimitConfig {
  /** Window duration in seconds */
  windowSeconds: number;
  /** Maximum requests allowed in the window */
  maxRequests: number;
}

/**
 * Redis-based sliding window rate limiter using sorted sets.
 * Returns null if the request is allowed, or a 429 NextResponse if rate limited.
 */
export async function rateLimit(
  req: NextRequest,
  key: string,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const { windowSeconds, maxRequests } = config;

  // Use IP + key for per-client rate limiting
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const redisKey = `rl:${key}:${ip}`;

  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const pipeline = redis.pipeline();
  // Remove entries outside the window
  pipeline.zremrangebyscore(redisKey, 0, windowStart);
  // Count entries in the window
  pipeline.zcard(redisKey);
  // Add the current request
  pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);
  // Set TTL so the key auto-expires
  pipeline.expire(redisKey, windowSeconds);

  const results = await pipeline.exec();
  // zcard result is at index 1, value at index 1
  const count = (results?.[1]?.[1] as number) ?? 0;

  if (count >= maxRequests) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(windowSeconds),
        },
      }
    );
  }

  return null;
}
