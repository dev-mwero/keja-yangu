import { describe, expect, it } from "vitest";
import { isProfileComplete } from "./profile-completion";

describe("isProfileComplete", () => {
  it("returns false for null or undefined user", () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete(undefined)).toBe(false);
  });

  it("returns false when name is missing or whitespace", () => {
    expect(
      isProfileComplete({
        email: "tenant@keja.co",
        name: "",
        phone: "+254712345678",
        nationalId: "12345678",
      }),
    ).toBe(false);
  });

  it("returns false when name is equal to email (invite placeholder)", () => {
    expect(
      isProfileComplete({
        email: "custodian@keja.co",
        name: "custodian@keja.co",
        phone: "+254712345678",
        nationalId: "12345678",
      }),
    ).toBe(false);

    expect(
      isProfileComplete({
        email: "Custodian@Keja.co",
        name: "custodian@keja.co",
        phone: "+254712345678",
        nationalId: "12345678",
      }),
    ).toBe(false);
  });

  it("returns false when phone is missing or not valid E.164", () => {
    expect(
      isProfileComplete({
        email: "tenant@keja.co",
        name: "Tenant Name",
        phone: "",
        nationalId: "12345678",
      }),
    ).toBe(false);

    expect(
      isProfileComplete({
        email: "tenant@keja.co",
        name: "Tenant Name",
        phone: "0712345678",
        nationalId: "12345678",
      }),
    ).toBe(false);
  });

  it("returns false when nationalId is missing or empty", () => {
    expect(
      isProfileComplete({
        email: "tenant@keja.co",
        name: "Tenant Name",
        phone: "+254712345678",
        nationalId: "",
      }),
    ).toBe(false);

    expect(
      isProfileComplete({
        email: "tenant@keja.co",
        name: "Tenant Name",
        phone: "+254712345678",
        nationalId: "   ",
      }),
    ).toBe(false);
  });

  it("returns true when name, valid phone and nationalId are all present", () => {
    expect(
      isProfileComplete({
        email: "tenant@keja.co",
        name: "Tenant Name",
        phone: "+254712345678",
        nationalId: "12345678",
      }),
    ).toBe(true);

    // Encrypted string or alphanumeric ID
    expect(
      isProfileComplete({
        email: "custodian@keja.co",
        name: "Custodian Jane",
        phone: "+254700000000",
        nationalId: "ky:v1:somecipher",
      }),
    ).toBe(true);
  });
});
