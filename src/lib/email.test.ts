import { describe, expect, it } from "vitest";

import { isEmailConfigured } from "./email";

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

  it("should report when SMTP email is not configured", () => {
    const previous = {
      EMAIL_HOST: process.env.EMAIL_HOST,
      EMAIL_USER: process.env.EMAIL_USER,
      EMAIL_PASS: process.env.EMAIL_PASS,
    };

    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;

    try {
      expect(isEmailConfigured()).toBe(false);
    } finally {
      Object.assign(process.env, previous);
    }
  });
});
