import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("validation schemas", () => {
  it("validates sign in schema", () => {
    const signInSchema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
    });

    expect(
      signInSchema.safeParse({ email: "test@test.com", password: "password123" }).success,
    ).toBe(true);
    expect(signInSchema.safeParse({ email: "invalid", password: "short" }).success).toBe(false);
  });

  it("validates sign up schema", () => {
    const signUpSchema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["tenant", "caretaker", "owner"]),
    });

    expect(
      signUpSchema.safeParse({
        name: "John Doe",
        email: "john@test.com",
        password: "password123",
        role: "tenant",
      }).success,
    ).toBe(true);
    expect(
      signUpSchema.safeParse({ name: "J", email: "invalid", password: "123", role: "admin" })
        .success,
    ).toBe(false);
  });
});
