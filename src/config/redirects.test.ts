import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("tenant IA redirects", () => {
  it("redirects every retired tenant route to its consolidated page", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const destination = new Map(redirects.map((r) => [r.source, r.destination]));

    expect(destination.get("/dashboard/tenant/units")).toBe("/properties");
    expect(destination.get("/dashboard/tenant/applications")).toBe("/dashboard/tenant/requests");
    expect(destination.get("/dashboard/tenant/move-requests")).toBe("/dashboard/tenant/requests");
    expect(destination.get("/dashboard/tenant/complaints")).toBe("/dashboard/tenant/home");
    expect(destination.get("/dashboard/tenant/chat")).toBe("/dashboard/tenant/messages");
    expect(destination.get("/dashboard/tenant/announcements")).toBe("/dashboard/tenant/messages");
    expect(destination.get("/dashboard/tenant/reports")).toBe("/dashboard/tenant");
  });

  it("uses temporary redirects so the old URLs can be reclaimed", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.length).toBeGreaterThan(0);
    expect(redirects.every((r) => r.permanent === false)).toBe(true);
  });
});
