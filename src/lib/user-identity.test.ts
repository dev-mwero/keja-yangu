/** @vitest-environment node */
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPhoneOnlyAccount,
  normalizeContactEmail,
  normalizeContactPhone,
  resolveUserByContact,
} from "@/lib/user-identity";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/models/User", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { User: get().user };
});

const { user } = getModelStubs();
const USER_ID = makeObjectId("user");

function leanUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    name: "Jane",
    email: "jane@keja.co",
    phone: "+254712345678",
    role: "tenant",
    ...overrides,
  };
}

describe("contact normalization", () => {
  it("trims and lowercases emails", () => {
    expect(normalizeContactEmail("  Jane@Keja.CO ")).toBe("jane@keja.co");
  });

  it("normalizes local Kenyan numbers to E.164", () => {
    expect(normalizeContactPhone("0712 345 678")).toBe("+254712345678");
    expect(normalizeContactPhone("254712345678")).toBe("+254712345678");
    expect(normalizeContactPhone("+254712345678")).toBe("+254712345678");
  });

  it("returns an empty string for unusable phone values", () => {
    expect(normalizeContactPhone("")).toBe("");
    expect(normalizeContactPhone("not-a-phone")).toBe("");
  });
});

describe("resolveUserByContact", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("requires at least one contact", async () => {
    const result = await resolveUserByContact({ email: " ", phone: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("missing-contact");
    expect(result.user).toBeUndefined();
  });

  it("rejects an invalid phone when no email is supplied", async () => {
    const result = await resolveUserByContact({ phone: "12" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("invalid-phone");
  });

  it("finds an existing user by normalized email", async () => {
    user.findOne.mockReturnValueOnce(buildQuery(leanUser()));
    const result = await resolveUserByContact({ email: " JANE@KEJA.CO " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user?._id).toBe(USER_ID);
    expect(user.findOne).toHaveBeenCalledWith({ email: "jane@keja.co" });
  });

  it("finds an existing user by normalized phone", async () => {
    user.findOne.mockReturnValueOnce(buildQuery(leanUser()));
    const result = await resolveUserByContact({ phone: "0712345678" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user?._id).toBe(USER_ID);
    expect(user.findOne).toHaveBeenCalledWith({ phone: "+254712345678" });
  });

  it("returns a conflict when email and phone point to different users", async () => {
    user.findOne
      .mockReturnValueOnce(buildQuery(leanUser({ _id: makeObjectId("a") })))
      .mockReturnValueOnce(buildQuery(leanUser({ _id: makeObjectId("b") })));
    const result = await resolveUserByContact({
      email: "a@keja.co",
      phone: "+254712345678",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("identity-conflict");
  });

  it("returns the single user when both contacts match the same account", async () => {
    user.findOne
      .mockReturnValueOnce(buildQuery(leanUser()))
      .mockReturnValueOnce(buildQuery(leanUser()));
    const result = await resolveUserByContact({
      email: "jane@keja.co",
      phone: "+254712345678",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user?._id).toBe(USER_ID);
  });
});

describe("createPhoneOnlyAccount", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("creates an active verified account with a hashed temporary password", async () => {
    const created = leanUser({ email: undefined, isActive: true, isVerified: true });
    user.create.mockResolvedValue(created);

    const result = await createPhoneOnlyAccount({
      role: "caretaker",
      name: " New Caretaker ",
      phone: "0712345678",
      managedByOwnerId: makeObjectId("owner"),
      privileges: ["manage_tenants"],
    });

    expect(result.password).toHaveLength(16);
    expect(result.user).toBe(created);
    const payload = user.create.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      email: undefined,
      name: "New Caretaker",
      phone: "+254712345678",
      role: "caretaker",
      isActive: true,
      isVerified: true,
      managedByOwnerId: makeObjectId("owner"),
      privileges: ["manage_tenants"],
    });
    expect(typeof payload.passwordHash).toBe("string");
    expect(await bcrypt.compare(result.password, payload.passwordHash as string)).toBe(true);
  });

  it("rejects an invalid phone", async () => {
    await expect(
      createPhoneOnlyAccount({ role: "tenant", name: "Bad", phone: "not-a-phone" }),
    ).rejects.toThrow("valid E.164");
    expect(user.create).not.toHaveBeenCalled();
  });
});
