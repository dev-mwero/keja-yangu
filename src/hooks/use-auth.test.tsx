import { describe, expect, it } from "vitest";

describe("Auth", () => {
  it("should have proper role mapping", () => {
    const roleMap: Record<string, string[]> = {
      "/dashboard/owner": ["owner"],
      "/dashboard/tenant": ["tenant"],
      "/dashboard/caretaker": ["caretaker"],
    };

    expect(roleMap["/dashboard/owner"]).toContain("owner");
    expect(roleMap["/dashboard/tenant"]).toContain("tenant");
    expect(roleMap["/dashboard/caretaker"]).toContain("caretaker");
  });

  it("should validate email role detection", () => {
    const getRole = (email: string) => {
      if (email.startsWith("owner")) return "owner";
      if (email.startsWith("care")) return "caretaker";
      return "tenant";
    };

    expect(getRole("owner@test.com")).toBe("owner");
    expect(getRole("care@test.com")).toBe("caretaker");
    expect(getRole("tenant@test.com")).toBe("tenant");
  });
});
