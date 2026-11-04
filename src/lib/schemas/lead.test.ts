import { describe, expect, it } from "vitest";
import { leadInput, leadUpdateInput } from "./lead";

describe("leadInput", () => {
  it("accepts a valid lead with name and phone", () => {
    const parsed = leadInput.safeParse({
      name: "John Doe",
      phone: "+254712345678",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("John Doe");
      expect(parsed.data.phone).toBe("+254712345678");
      expect(parsed.data.email).toBeUndefined();
    }
  });

  it("accepts an optional email", () => {
    const parsed = leadInput.safeParse({
      name: "John Doe",
      phone: "+254712345678",
      email: "john@example.com",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const parsed = leadInput.safeParse({
      name: "   ",
      phone: "+254712345678",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing phone", () => {
    const parsed = leadInput.safeParse({
      name: "John Doe",
      phone: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const parsed = leadInput.safeParse({
      name: "John Doe",
      phone: "+254712345678",
      email: "not-an-email",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("leadUpdateInput", () => {
  it("accepts a status transition", () => {
    const parsed = leadUpdateInput.safeParse({ status: "approved" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("approved");
    }
  });

  it("rejects an invalid status", () => {
    const parsed = leadUpdateInput.safeParse({ status: "archived" });
    expect(parsed.success).toBe(false);
  });

  it("accepts an empty update", () => {
    const parsed = leadUpdateInput.safeParse({});
    expect(parsed.success).toBe(true);
  });
});
