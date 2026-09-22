import { type NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}

setInterval(cleanupExpired, 60_000);

export async function rateLimit(request: NextRequest, options: { windowMs?: number; limit?: number } = {}) {
  const { windowMs = 60_000, limit = 10 } = options;
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  const resetAt = now + windowMs;

  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt });
    return { remaining: limit - 1, reset: resetAt };
  }

  if (entry.count >= limit) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": Math.ceil((entry.resetAt - now) / 1000).toString() } },
    );
  }

  entry.count++;
  return { remaining: limit - entry.count, reset: entry.resetAt };
}

export function rateLimitHeaders(response: NextResponse, remaining: number, reset: number) {
  response.headers.set("X-RateLimit-Remaining", remaining.toString());
  response.headers.set("X-RateLimit-Reset", Math.ceil(reset / 1000).toString());
  return response;
}