import { describe, expect, it } from "vitest";
import { applicationCreateInput } from "./application";

describe("applicationCreateInput", () => {
  it("accepts a property-level request without unitId", () => {
    const parsed = applicationCreateInput.safeParse({
      propertyId: "p1",
      name: "Amina",
      email: "amina@keja.co",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a unit-scoped request and trims the unitId", () => {
    const parsed = applicationCreateInput.safeParse({
      propertyId: "p1",
      unitId: "  u1  ",
      name: "Amina",
      email: "amina@keja.co",
      message: "Ground floor please",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.unitId).toBe("u1");
  });

  it("rejects an empty unitId", () => {
    const parsed = applicationCreateInput.safeParse({
      propertyId: "p1",
      unitId: "",
      name: "Amina",
      email: "amina@keja.co",
    });
    expect(parsed.success).toBe(false);
  });
});
