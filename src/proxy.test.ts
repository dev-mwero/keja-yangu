/** @vitest-environment node */
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { getJwtSecret } from "@/lib/jwt";
import { proxy } from "@/proxy";

function buildDashboardRequest(path: string, token?: string): NextRequest {
  const url = `http://localhost:3000${path}`;
  const headers = new Headers();
  if (token) {
    headers.set("cookie", `keja-token=${token}`);
  }
  return new NextRequest(url, { headers });
}

function makeToken(role: string): string {
  return jwt.sign({ userId: "user-123", role }, getJwtSecret());
}

describe("proxy middleware", () => {
  it("redirects unauthenticated dashboard request to /auth", async () => {
    const req = buildDashboardRequest("/dashboard/owner");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth");
  });

  it("redirects invalid token to /auth", async () => {
    const req = buildDashboardRequest("/dashboard/owner", "invalid-token");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth");
  });

  it("redirects root /dashboard to the role default route", async () => {
    const req = buildDashboardRequest("/dashboard", makeToken("owner"));
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard/owner");
  });

  it("allows owner accessing /dashboard/owner", async () => {
    const req = buildDashboardRequest("/dashboard/owner", makeToken("owner"));
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  it("allows admin accessing /dashboard/owner and nested pages", async () => {
    const req = buildDashboardRequest("/dashboard/owner/portfolio/123", makeToken("admin"));
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  it("redirects tenant attempting to access /dashboard/owner to /dashboard/tenant", async () => {
    const req = buildDashboardRequest("/dashboard/owner", makeToken("tenant"));
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard/tenant");
  });

  it("allows tenant accessing /dashboard/tenant/invoices", async () => {
    const req = buildDashboardRequest("/dashboard/tenant/invoices", makeToken("tenant"));
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  it("passes through non-dashboard requests", async () => {
    const req = buildDashboardRequest("/api/v1/properties");
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });
});

