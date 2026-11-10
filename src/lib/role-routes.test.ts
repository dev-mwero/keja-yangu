import { describe, expect, it } from "vitest";
import { getDashboardAllowedRoles, getRoleRoute } from "@/lib/role-routes";

describe("getDashboardAllowedRoles", () => {
  it("matches dashboard roots", () => {
    expect(getDashboardAllowedRoles("/dashboard/admin")).toEqual(["admin", "system-admin"]);
    expect(getDashboardAllowedRoles("/dashboard/owner")).toEqual(["admin", "system-admin"]);
    expect(getDashboardAllowedRoles("/dashboard/tenant")).toEqual(["tenant"]);
    expect(getDashboardAllowedRoles("/dashboard/custodian")).toEqual([
      "custodian",
      "admin",
      "system-admin",
    ]);
    expect(getDashboardAllowedRoles("/dashboard/broker")).toEqual(["broker", "system-admin"]);
    expect(getDashboardAllowedRoles("/dashboard/broker")).toEqual(["broker", "system-admin"]);
  });

  it("matches nested dashboard paths", () => {
    expect(getDashboardAllowedRoles("/dashboard/admin/portfolio/123")).toEqual([
      "admin",
      "system-admin",
    ]);
    expect(getDashboardAllowedRoles("/dashboard/owner/portfolio/123")).toEqual([
      "admin",
      "system-admin",
    ]);
    expect(getDashboardAllowedRoles("/dashboard/tenant/invoices/abc/pay")).toEqual(["tenant"]);
    expect(getDashboardAllowedRoles("/dashboard/caretaker/portfolio/123/structure")).toEqual([
      "caretaker",
      "system-admin",
    ]);
  });

  it("does not match lookalike prefixes", () => {
    expect(getDashboardAllowedRoles("/dashboard/adminfoo")).toBeUndefined();
    expect(getDashboardAllowedRoles("/dashboard/ownerfoo")).toBeUndefined();
    expect(getDashboardAllowedRoles("/dashboard/tenantx/1")).toBeUndefined();
  });
});

describe("getRoleRoute", () => {
  it("routes admin to /dashboard/admin", () => {
    expect(getRoleRoute("admin")).toBe("/dashboard/admin");
  });

  it("routes broker to /dashboard/broker", () => {
    expect(getRoleRoute("broker")).toBe("/dashboard/broker");
  });
});
