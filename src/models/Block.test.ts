import { describe, expect, it } from "vitest";
import { Block } from "@/models/Block";

describe("Block schema", () => {
  it("defines required and default fields", () => {
    const doc = new Block({
      propertyId: "prop-123",
      name: "Block A",
    });

    expect(doc.propertyId).toBe("prop-123");
    expect(doc.name).toBe("Block A");
    expect(doc.order).toBe(0);
    expect(doc.rentOverride).toBeNull();
    expect(doc.purpose).toBeNull();
    expect(doc.legacyEmbeddedId).toBe("");
    expect(doc.deletedAt).toBeNull();
  });

  it("fails validation without required propertyId or name", async () => {
    const doc = new Block({});
    const err = doc.validateSync();
    expect(err?.errors.propertyId).toBeDefined();
    expect(err?.errors.name).toBeDefined();
  });
});

