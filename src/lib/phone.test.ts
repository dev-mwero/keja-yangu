import { describe, expect, it } from "vitest";

import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  formatPhone,
  isValidE164,
  isValidNationalId,
  nationalDigits,
  normalizeNationalId,
  parsePhone,
  toE164,
} from "@/lib/phone";

describe("toE164", () => {
  it("composes a dial code and national number", () => {
    expect(toE164("+254", "712345678")).toBe("+254712345678");
  });

  it("drops a national trunk zero and separators", () => {
    expect(toE164("+254", "0712 345 678")).toBe("+254712345678");
  });

  it("accepts a dial code without a leading plus", () => {
    expect(toE164("254", "712345678")).toBe("+254712345678");
  });

  it("returns an empty string when there is no national number", () => {
    expect(toE164("+254", "")).toBe("");
    expect(toE164("+254", "abc")).toBe("");
  });
});

describe("nationalDigits", () => {
  it("keeps digits only and strips leading zeros", () => {
    expect(nationalDigits("(0712) 345-678")).toBe("712345678");
  });
});

describe("isValidE164", () => {
  it("accepts well-formed E.164 numbers", () => {
    expect(isValidE164("+254712345678")).toBe(true);
  });

  it("rejects numbers without a country code", () => {
    expect(isValidE164("0712345678")).toBe(false);
    expect(isValidE164("+0123456789")).toBe(false);
    expect(isValidE164("")).toBe(false);
  });
});

describe("parsePhone", () => {
  it("splits a Kenyan number into dial code and national number", () => {
    expect(parsePhone("+254712345678")).toEqual({
      country: { code: "KE", dial: "+254", name: "Kenya" },
      national: "712345678",
    });
  });

  it("recognises a US number", () => {
    expect(parsePhone("+15551234567")?.country.code).toBe("US");
  });

  it("returns null for empty or unrecognised values", () => {
    expect(parsePhone("")).toBeNull();
    expect(parsePhone("0712345678")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("groups the national number for display", () => {
    expect(formatPhone("+254712345678")).toBe("+254 712 345 678");
  });

  it("falls back to the raw value when it cannot be parsed", () => {
    expect(formatPhone("not-a-number")).toBe("not-a-number");
  });
});

describe("national ID helpers", () => {
  it("normalises case and separators", () => {
    expect(normalizeNationalId(" 12-345 678 ")).toBe("12345678");
  });

  it("accepts alphanumeric ids of a sane length", () => {
    expect(isValidNationalId("12345678")).toBe(true);
    expect(isValidNationalId("AB123456")).toBe(true);
  });

  it("rejects too-short and too-long values", () => {
    expect(isValidNationalId("123")).toBe(false);
    expect(isValidNationalId("A".repeat(33))).toBe(false);
  });
});

describe("countries", () => {
  it("defaults to Kenya", () => {
    expect(DEFAULT_COUNTRY.code).toBe("KE");
    expect(DEFAULT_COUNTRY.dial).toBe("+254");
  });

  it("includes Kenya among the options", () => {
    expect(COUNTRIES.map((c) => c.code)).toContain("KE");
  });
});
