import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { type NextRequest, NextResponse } from "next/server";

const hasUpstashConfig = process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN;

let ratelimit: Ratelimit | null = null;

if (hasUpstashConfig) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "@keja-yangu:",
  });
}

export async function rateLimit(request: NextRequest) {
  if (!ratelimit) {
    return null;
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success, remaining, reset } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": `${reset - Date.now()}` } },
    );
  }

  return { remaining, reset };
}

export function rateLimitHeaders(response: NextResponse, remaining: number, reset: number) {
  response.headers.set("X-RateLimit-Remaining", remaining.toString());
  response.headers.set("X-RateLimit-Reset", reset.toString());
  return response;
}