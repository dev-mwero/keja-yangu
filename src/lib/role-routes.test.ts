import { describe, expect, it } from "vitest";
import { getDashboardAllowedRoles } from "@/lib/role-routes";

describe("getDashboardAllowedRoles", () => {
  it("matches dashboard roots", () => {
    expect(getDashboardAllowedRoles("/dashboard/owner")).toEqual(["owner", "system-admin"]);
    expect(getDashboardAllowedRoles("/dashboard/tenant")).toEqual(["tenant"]);
    expect(getDashboardAllowedRoles("/dashboard/custodian")).toEqual([
      "custodian",
      "owner",
      "system-admin",
    ]);
  });

  it("matches nested dashboard paths", () => {
    expect(getDashboardAllowedRoles("/dashboard/owner/portfolio/123")).toEqual([
      "owner",
      "system-admin",
    ]);
    expect(getDashboardAllowedRoles("/dashboard/tenant/invoices/abc/pay")).toEqual(["tenant"]);
    expect(getDashboardAllowedRoles("/dashboard/caretaker/portfolio/123/structure")).toEqual([
      "caretaker",
      "system-admin",
    ]);
  });

  it("does not match lookalike prefixes", () => {
    expect(getDashboardAllowedRoles("/dashboard/ownerfoo")).toBeUndefined();
    expect(getDashboardAllowedRoles("/dashboard/tenantx/1")).toBeUndefined();
  });
});
