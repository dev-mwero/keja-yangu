/** @vitest-environment node */
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/email", () => ({
  isEmailConfigured: vi.fn().mockReturnValue(false),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));

import { POST } from "@/app/api/auth/route";
import { decryptField, isEncrypted } from "@/lib/crypto";
import { isEmailConfigured, sendVerificationEmail } from "@/lib/email";
import { resetAuthRateLimits } from "@/lib/rate-limit-auth";

const { user, tenant: tenantStub } = getModelStubs();

const USER_ID = makeObjectId("user");

function mutableUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    email: "TENANT@Keja.co",
    role: "tenant",
    isVerified: false,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/auth — signup merge", () => {
  beforeEach(() => {
    resetModelStubs();
    resetAuthRateLimits();
  });

  it("adopts an inactive, unverified pre-created caretaker instead of duplicating", async () => {
    const preCreated = {
      _id: USER_ID,
      email: "care@keja.co",
      role: "caretaker",
      isActive: false,
      isVerified: false,
      managedByOwnerId: makeObjectId("owner"),
      name: "Old Name",
      passwordHash: "old-hash",
      privileges: ["manage_tenants"],
      phone: "",
      nationalId: "",
      verificationToken: undefined as string | undefined,
      verificationTokenExpiry: undefined as Date | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
    user.findOne.mockResolvedValue(preCreated);
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    vi.mocked(sendVerificationEmail).mockResolvedValue(true);

    const res = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        body: {
          action: "signup",
          name: "New Name",
          email: "care@keja.co",
          password: "secret123",
          role: "caretaker",
          phone: "+254712345678",
          nationalId: "12345678",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(preCreated.isActive).toBe(true);
    expect(preCreated.isVerified).toBe(false);
    expect(preCreated.name).toBe("New Name");
    expect(preCreated.role).toBe("caretaker");
    expect(preCreated.phone).toBe("+254712345678");
    expect(isEncrypted(preCreated.nationalId)).toBe(true);
    expect(decryptField(preCreated.nationalId)).toBe("12345678");
    expect(preCreated.privileges).toEqual(["manage_tenants"]);
    expect(preCreated.passwordHash).not.toBe("old-hash");
    expect(preCreated.save).toHaveBeenCalledTimes(1);
    expect(user.create).not.toHaveBeenCalled();
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "care@keja.co",
      preCreated.verificationToken,
      "New Name",
    );
  });

  it("409 for an already registered active user", async () => {
    user.findOne.mockResolvedValue({
      _id: USER_ID,
      email: "care@keja.co",
      role: "caretaker",
      isActive: true,
      isVerified: true,
      managedByOwnerId: "",
    });
    const res = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        body: {
          action: "signup",
          name: "Name",
          email: "care@keja.co",
          password: "secret123",
          role: "tenant",
          phone: "+254712345678",
          nationalId: "12345678",
        },
      }),
    );
    expect(res.status).toBe(409);
  });

  it("400 when the mobile number is not valid E.164", async () => {
    const res = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        body: {
          action: "signup",
          name: "New Name",
          email: "new@keja.co",
          password: "secret123",
          role: "tenant",
          phone: "0712345678",
          nationalId: "12345678",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(user.create).not.toHaveBeenCalled();
  });

  it("creates a fresh user with phone and a normalised national id", async () => {
    user.findOne.mockResolvedValue(null);
    user.create.mockImplementation(async (doc: Record<string, unknown>) => doc);
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    vi.mocked(sendVerificationEmail).mockResolvedValue(true);

    const res = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        body: {
          action: "signup",
          name: "New Name",
          email: "new@keja.co",
          password: "secret123",
          role: "tenant",
          phone: "+254712345678",
          nationalId: "ab-123 456",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(user.create).toHaveBeenCalledTimes(1);
    const created = user.create.mock.calls[0][0] as Record<string, unknown>;
    expect(created.phone).toBe("+254712345678");
    expect(isEncrypted(created.nationalId as string)).toBe(true);
    expect(decryptField(created.nationalId as string)).toBe("AB123456");
  });
});

describe("POST /api/auth — verify-email", () => {
  beforeEach(() => {
    resetModelStubs();
    resetAuthRateLimits();
  });

  it("400 when the token is missing", async () => {
    const res = await POST(
      buildRequest("/api/auth", { method: "POST", body: { action: "verify-email" } }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Verification token required");
    expect(user.findOne).not.toHaveBeenCalled();
  });

  it("400 when no user matches the token", async () => {
    user.findOne.mockResolvedValue(null);
    const res = await POST(
      buildRequest("/api/auth", { method: "POST", body: { action: "verify-email", token: "tok" } }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid or expired verification token");
    expect(tenantStub.updateMany).not.toHaveBeenCalled();
  });

  it("binds unbound tenant rows to the verified tenant user by normalized email", async () => {
    const doc = mutableUser({
      name: "Tenant Person",
      phone: "+254712345678",
      nationalId: "12345678",
    });
    user.findOne.mockResolvedValue(doc);

    const res = await POST(
      buildRequest("/api/auth", { method: "POST", body: { action: "verify-email", token: "tok" } }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.message).toBe("Email verified successfully");
    expect(body.user).toEqual({ email: "TENANT@Keja.co", name: "Tenant Person", role: "tenant" });
    expect(body.redirectTo).toBe("/dashboard/tenant");
    expect(res.cookies.get("keja-token")?.value).toBeTruthy();

    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(tenantStub.updateMany).toHaveBeenCalledWith(
      { email: "tenant@keja.co", userId: "" },
      { $set: { userId: USER_ID } },
    );
  });

  it("activates pending invite and redirects an incomplete profile to settings with ?next", async () => {
    const doc = mutableUser({
      role: "custodian",
      email: "custodian@keja.co",
      name: "custodian@keja.co",
      phone: "",
      nationalId: "",
      isActive: false,
      managedByOwnerId: "owner_123",
    }) as unknown as { isActive: boolean; isVerified: boolean };
    user.findOne.mockResolvedValue(doc);

    const res = await POST(
      buildRequest("/api/auth", { method: "POST", body: { action: "verify-email", token: "tok" } }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.redirectTo).toBe("/dashboard/custodian/settings?next=%2Fdashboard%2Fcustodian");
    expect(res.cookies.get("keja-token")?.value).toBeTruthy();
    expect(doc.isActive).toBe(true);
    expect(doc.isVerified).toBe(true);
  });

  it("does not bind tenant rows for a verified owner", async () => {
    const doc = mutableUser({ role: "owner", email: "owner@keja.co" });
    user.findOne.mockResolvedValue(doc);

    const res = await POST(
      buildRequest("/api/auth", { method: "POST", body: { action: "verify-email", token: "tok" } }),
    );
    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(tenantStub.updateMany).not.toHaveBeenCalled();
  });

  it("does not bind tenant rows for a verified caretaker", async () => {
    const doc = mutableUser({ role: "caretaker", email: "caretaker@keja.co" });
    user.findOne.mockResolvedValue(doc);

    const res = await POST(
      buildRequest("/api/auth", { method: "POST", body: { action: "verify-email", token: "tok" } }),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.updateMany).not.toHaveBeenCalled();
  });

  it("queries with an unexpired verification token window", async () => {
    const doc = mutableUser();
    user.findOne.mockResolvedValue(doc);
    await POST(
      buildRequest("/api/auth", { method: "POST", body: { action: "verify-email", token: "tok" } }),
    );
    const [filter] = user.findOne.mock.calls[0] as [Record<string, unknown>];
    expect(filter.verificationToken).toBe("tok");
    expect(filter.verificationTokenExpiry).toEqual({ $gt: expect.any(Date) });
  });
});

describe("POST /api/auth — signin tenant binding", () => {
  beforeEach(() => {
    resetModelStubs();
    resetAuthRateLimits();
  });

  function activeTenant() {
    return {
      _id: USER_ID,
      email: "tenant@keja.co",
      name: "Amina",
      role: "tenant",
      isActive: true,
      isVerified: true,
      passwordHash: bcrypt.hashSync("secret123", 4),
    };
  }

  it("binds unbound tenant rows to the signing-in tenant by normalized email", async () => {
    user.findOne.mockReturnValue(buildQuery(activeTenant()));

    const res = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        body: { action: "signin", email: "Tenant@Keja.co", password: "secret123" },
      }),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.updateMany).toHaveBeenCalledWith(
      { email: "tenant@keja.co", userId: "" },
      { $set: { userId: USER_ID } },
    );
  });

  it("does not touch tenant rows when an owner signs in", async () => {
    user.findOne.mockReturnValue(
      buildQuery({ ...activeTenant(), role: "owner", email: "owner@keja.co" }),
    );

    const res = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        body: { action: "signin", email: "owner@keja.co", password: "secret123" },
      }),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.updateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth — signin by phone", () => {
  beforeEach(() => {
    resetModelStubs();
    resetAuthRateLimits();
  });

  it("signs in a user by phone number when email lookup misses", async () => {
    const phoneUser = {
      _id: USER_ID,
      email: undefined,
      phone: "+254712345678",
      name: "Jane",
      role: "caretaker",
      isActive: true,
      isVerified: true,
      passwordHash: await bcrypt.hash("secret123", 12),
    };
    user.findOne.mockReturnValueOnce(buildQuery(null));
    user.findOne.mockReturnValueOnce(buildQuery(phoneUser));

    const res = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        body: { action: "signin", identifier: "+254712345678", password: "secret123" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    const signedInUser = body.user as { role: string; phone: string };
    expect(signedInUser.role).toBe("caretaker");
    expect(signedInUser.phone).toBe("+254712345678");
  });

  it("still signs in with email for backward compatibility", async () => {
    const emailUser = {
      _id: USER_ID,
      email: "tenant@keja.co",
      name: "Amina",
      role: "tenant",
      isActive: true,
      isVerified: true,
      passwordHash: await bcrypt.hash("secret123", 12),
    };
    user.findOne.mockReturnValue(buildQuery(emailUser));

    const res = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        body: { action: "signin", email: "TENANT@Keja.co", password: "secret123" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("401 when phone lookup finds no active verified user", async () => {
    user.findOne.mockReturnValueOnce(buildQuery(null));
    user.findOne.mockReturnValueOnce(buildQuery(null));

    const res = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        body: { action: "signin", identifier: "+254712345678", password: "secret123" },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth — rate limiting", () => {
  beforeEach(() => {
    resetModelStubs();
    resetAuthRateLimits();
  });

  it("429s once an IP exceeds the per-action sign-in budget", async () => {
    user.findOne.mockReturnValue(buildQuery(null));
    const headers = { "x-forwarded-for": "203.0.113.7" };
    const signin = () =>
      POST(
        buildRequest("/api/auth", {
          method: "POST",
          headers,
          body: { action: "signin", email: "a@b.co", password: "secret123" },
        }),
      );

    // 10 attempts are allowed (each 401 — no such user), the 11th is throttled.
    for (let i = 0; i < 10; i++) {
      expect((await signin()).status).toBe(401);
    }

    const limited = await signin();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("throttles each action independently", async () => {
    user.findOne.mockReturnValue(buildQuery(null));
    const headers = { "x-forwarded-for": "198.51.100.4" };
    // Exhaust signup (limit 5) with invalid payloads (400, no DB write).
    for (let i = 0; i < 5; i++) {
      await POST(
        buildRequest("/api/auth", { method: "POST", headers, body: { action: "signup" } }),
      );
    }
    const signupLimited = await POST(
      buildRequest("/api/auth", { method: "POST", headers, body: { action: "signup" } }),
    );
    expect(signupLimited.status).toBe(429);

    // A different action from the same IP is unaffected.
    const signin = await POST(
      buildRequest("/api/auth", {
        method: "POST",
        headers,
        body: { action: "signin", email: "a@b.co", password: "secret123" },
      }),
    );
    expect(signin.status).toBe(401);
  });
});
