import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const hasUpstashConfig = process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN;

let ratelimit: Ratelimit | null = null;

if (hasUpstashConfig) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    prefix: "@keja-yangu:auth:",
  });
}

export async function rateLimitAuth(request: Request) {
  if (!ratelimit) {
    return null;
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  return null;
}