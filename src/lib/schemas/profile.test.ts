import { describe, expect, it } from "vitest";

import { profileUpdate } from "@/lib/schemas";

describe("profileUpdate schema", () => {
  it("accepts an empty payload", () => {
    expect(profileUpdate.safeParse({}).success).toBe(true);
  });

  it("accepts an E.164 mobile number", () => {
    const result = profileUpdate.safeParse({ phone: "+254712345678" });
    expect(result.success).toBe(true);
  });

  it("rejects a number without a country code", () => {
    const result = profileUpdate.safeParse({ phone: "0712345678" });
    expect(result.success).toBe(false);
  });

  it("accepts an empty string to clear a number", () => {
    expect(profileUpdate.safeParse({ whatsapp: "" }).success).toBe(true);
  });

  it("accepts a separated national id", () => {
    expect(profileUpdate.safeParse({ nationalId: "12-345 678" }).success).toBe(true);
  });

  it("rejects a national id that is too short", () => {
    expect(profileUpdate.safeParse({ nationalId: "12" }).success).toBe(false);
  });

  it("rejects a too-short name", () => {
    expect(profileUpdate.safeParse({ name: "A" }).success).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    const result = profileUpdate.safeParse({ name: "  Amina  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Amina");
  });
});
