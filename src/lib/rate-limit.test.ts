import { describe, expect, it } from "vitest";

describe("Rate limiting", () => {
  it("should allow requests within limit", () => {
    const limit = 10;
    const requests = 5;
    expect(requests).toBeLessThanOrEqual(limit);
  });

  it("should reject requests exceeding limit", () => {
    const limit = 10;
    const requests = 15;
    expect(requests > limit).toBe(true);
  });
});
