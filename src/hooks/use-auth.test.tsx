import { describe, expect, it } from "vitest";

describe("Auth", () => {
  it("should have proper role mapping", () => {
    const roleMap: Record<string, string[]> = {
      "/dashboard/admin": ["admin"],
      "/dashboard/owner": ["admin"],
      "/dashboard/tenant": ["tenant"],
      "/dashboard/caretaker": ["caretaker"],
    };

    expect(roleMap["/dashboard/admin"]).toContain("admin");
    expect(roleMap["/dashboard/owner"]).toContain("admin");
    expect(roleMap["/dashboard/tenant"]).toContain("tenant");
    expect(roleMap["/dashboard/caretaker"]).toContain("caretaker");
  });
});
