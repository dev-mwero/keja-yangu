import { describe, expect, it } from "vitest";

import { contactInput } from "@/lib/schemas/contact";

describe("contactInput", () => {
  it("accepts a valid submission", () => {
    const result = contactInput.safeParse({
      name: "Amina",
      email: "amina@example.com",
      subject: "Question",
      message: "I would like to know more about renting.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = contactInput.safeParse({
      name: "Amina",
      email: "not-an-email",
      subject: "Question",
      message: "I would like to know more about renting.",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.email).toBeTruthy();
  });

  it("rejects a too-short message", () => {
    const result = contactInput.safeParse({
      name: "Amina",
      email: "amina@example.com",
      subject: "Question",
      message: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = contactInput.safeParse({
      name: "   ",
      email: "amina@example.com",
      subject: "Question",
      message: "I would like to know more about renting.",
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace", () => {
    const result = contactInput.safeParse({
      name: "  Amina  ",
      email: "amina@example.com",
      subject: "  Question  ",
      message: "  I would like to know more about renting.  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Amina");
      expect(result.data.subject).toBe("Question");
    }
  });

  it("caps message length", () => {
    const result = contactInput.safeParse({
      name: "Amina",
      email: "amina@example.com",
      subject: "Question",
      message: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
