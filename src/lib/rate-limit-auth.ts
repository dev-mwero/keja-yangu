import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const authMemoryStore = new Map<string, RateLimitEntry>();

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of authMemoryStore.entries()) {
    if (entry.resetAt < now) {
      authMemoryStore.delete(key);
    }
  }
}

setInterval(cleanupExpired, 60_000);

export async function rateLimitAuth(request: Request, options: { windowMs?: number; limit?: number } = {}) {
  const { windowMs = 60_000, limit = 5 } = options;
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const key = `ratelimit:auth:${ip}`;
  const now = Date.now();
  const resetAt = now + windowMs;

  const entry = authMemoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    authMemoryStore.set(key, { count: 1, resetAt });
    return null;
  }

  if (entry.count >= limit) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  entry.count++;
  return null;
}