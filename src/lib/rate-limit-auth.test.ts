/** @vitest-environment node */
import { beforeEach, describe, expect, it } from "vitest";
import { rateLimitAuth, resetAuthRateLimits } from "@/lib/rate-limit-auth";

function req(ip: string): Request {
  return new Request("http://localhost:3000/api/auth", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("rateLimitAuth", () => {
  beforeEach(() => resetAuthRateLimits());

  it("allows requests up to the limit and then returns 429 with Retry-After", async () => {
    const options = { limit: 3, windowMs: 60_000, key: "signin" };
    expect(await rateLimitAuth(req("1.1.1.1"), options)).toBeNull();
    expect(await rateLimitAuth(req("1.1.1.1"), options)).toBeNull();
    expect(await rateLimitAuth(req("1.1.1.1"), options)).toBeNull();

    const limited = await rateLimitAuth(req("1.1.1.1"), options);
    expect(limited).not.toBeNull();
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
  });

  it("buckets independently per action key", async () => {
    const windowMs = 60_000;
    for (let i = 0; i < 2; i++) {
      await rateLimitAuth(req("2.2.2.2"), { limit: 2, windowMs, key: "signup" });
    }
    expect(
      await rateLimitAuth(req("2.2.2.2"), { limit: 2, windowMs, key: "signup" }),
    ).not.toBeNull();
    // Same IP, different action: untouched.
    expect(await rateLimitAuth(req("2.2.2.2"), { limit: 2, windowMs, key: "signin" })).toBeNull();
  });

  it("buckets independently per IP", async () => {
    const options = { limit: 2, windowMs: 60_000, key: "signin" };
    await rateLimitAuth(req("3.3.3.3"), options);
    await rateLimitAuth(req("3.3.3.3"), options);
    expect(await rateLimitAuth(req("3.3.3.3"), options)).not.toBeNull();
    expect(await rateLimitAuth(req("4.4.4.4"), options)).toBeNull();
  });

  it("shares one bucket for IP-less requests (still throttles)", async () => {
    const ipLess = () => new Request("http://localhost:3000/api/auth", { method: "POST" });
    const options = { limit: 1, windowMs: 60_000, key: "signin" };
    expect(await rateLimitAuth(ipLess(), options)).toBeNull();
    expect(await rateLimitAuth(ipLess(), options)).not.toBeNull();
  });

  it("resetAuthRateLimits clears the buckets", async () => {
    const options = { limit: 1, windowMs: 60_000, key: "signin" };
    await rateLimitAuth(req("5.5.5.5"), options);
    expect(await rateLimitAuth(req("5.5.5.5"), options)).not.toBeNull();
    resetAuthRateLimits();
    expect(await rateLimitAuth(req("5.5.5.5"), options)).toBeNull();
  });
});
