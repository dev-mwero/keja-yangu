import { describe, expect, it } from "vitest";
import { Tenant } from "@/models/Tenant";

describe("Tenant schema — type field", () => {
  it("type is one of residential, commercial, owning", () => {
    const typePath = (Tenant.schema.paths as Record<string, { enumValues?: string[] }>).type;
    expect(typePath.enumValues).toEqual(["residential", "commercial", "owning"]);
  });

  it("type defaults to residential", () => {
    const typePath = (Tenant.schema.paths as Record<string, { defaultValue?: string }>).type;
    expect(typePath.defaultValue).toBe("residential");
  });
});
