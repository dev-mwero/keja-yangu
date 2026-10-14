import { describe, expect, it } from "vitest";
import { matchesQuery } from "@/lib/search";

describe("matchesQuery", () => {
  it("matches everything for a blank or whitespace-only query", () => {
    expect(matchesQuery("", "anything")).toBe(true);
    expect(matchesQuery("   ", "anything")).toBe(true);
    expect(matchesQuery("", null, undefined)).toBe(true);
  });

  it("matches case-insensitively on any provided value", () => {
    expect(matchesQuery("sun", "Sunset Villa", "Kilimani")).toBe(true);
    expect(matchesQuery("KILIMANI", "Sunset Villa", "Kilimani")).toBe(true);
    expect(matchesQuery("villa", "Sunset Villa")).toBe(true);
  });

  it("matches substrings anywhere in the value", () => {
    expect(matchesQuery("lima", "Kilimani, Nairobi")).toBe(true);
  });

  it("does not match when no value contains the query", () => {
    expect(matchesQuery("westlands", "Sunset Villa", "Kilimani")).toBe(false);
  });

  it("ignores null and undefined values without throwing", () => {
    expect(matchesQuery("amka", null, undefined, "Amka")).toBe(true);
    expect(matchesQuery("amka", null, undefined)).toBe(false);
  });

  it("coerces numbers to strings", () => {
    expect(matchesQuery("45000", 45000)).toBe(true);
    expect(matchesQuery("1", 12, "Block")).toBe(true);
  });
});
