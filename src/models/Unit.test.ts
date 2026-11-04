import { describe, expect, it } from "vitest";
import { Unit } from "@/models/Unit";

describe("Unit schema — tenantId is an array", () => {
  it("tenantId is an array of strings", () => {
    const tenantIdPath = (Unit.schema.paths as Record<string, { $isMongooseArray?: boolean }>)
      .tenantId;
    expect(tenantIdPath.$isMongooseArray).toBe(true);
  });

  it("tenantId defaults to an empty array", () => {
    const doc = new Unit({} as unknown as ConstructorParameters<typeof Unit>[0]);
    expect(doc.tenantId).toEqual([]);
  });
});
