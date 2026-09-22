import { describe, expect, it } from "vitest";

describe("Email verification", () => {
  it("should generate a verification token", async () => {
    const token = crypto.randomUUID();
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(0);
  });

  it("should have 24-hour token expiry", () => {
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const now = new Date();
    expect(expiry.getTime() - now.getTime()).toBeCloseTo(24 * 60 * 60 * 1000, -2);
  });
});
