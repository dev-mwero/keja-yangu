/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

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

describe("POST /api/auth — verify-email", () => {
  beforeEach(() => {
    resetModelStubs();
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
    const doc = mutableUser();
    user.findOne.mockResolvedValue(doc);

    const res = await POST(
      buildRequest("/api/auth", { method: "POST", body: { action: "verify-email", token: "tok" } }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.message).toBe("Email verified successfully");

    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(tenantStub.updateMany).toHaveBeenCalledWith(
      { email: "tenant@keja.co", userId: "" },
      { $set: { userId: USER_ID } },
    );
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
