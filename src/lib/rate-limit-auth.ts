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

export interface AuthRateLimitOptions {
  windowMs?: number;
  limit?: number;
  /**
   * Bucket scope, so e.g. `signin` and `signup` do not share a counter. Callers
   * pass the action name; the same IP still gets its own bucket per action.
   */
  key?: string;
}

/** Test-only: clears every bucket so limiter state cannot leak between tests. */
export function resetAuthRateLimits() {
  authMemoryStore.clear();
}

/**
 * Throttles unauthenticated credential/email endpoints, keyed by client IP and
 * action. `x-forwarded-for` is only meaningful behind a proxy that overwrites
 * it (Vercel and most PaaS do); without it every request shares one `unknown`
 * bucket, which still throttles an attacker rather than disabling the limit.
 */
export async function rateLimitAuth(
  request: Request,
  options: AuthRateLimitOptions = {},
): Promise<NextResponse | null> {
  const { windowMs = 60_000, limit = 5, key = "default" } = options;
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const bucket = `ratelimit:auth:${key}:${ip}`;
  const now = Date.now();
  const resetAt = now + windowMs;

  const entry = authMemoryStore.get(bucket);

  if (!entry || entry.resetAt < now) {
    authMemoryStore.set(bucket, { count: 1, resetAt });
    return null;
  }

  if (entry.count >= limit) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((entry.resetAt - now) / 1000).toString() },
      },
    );
  }

  entry.count++;
  return null;
}
