/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));

import { GET, PATCH } from "@/app/api/v1/users/me/route";

const { user } = getModelStubs();

const USER_ID = makeObjectId("user");

function tenantDoc(overrides: Record<string, unknown> = {}) {
  return {
    ...makeUser({ _id: USER_ID, role: "tenant" }),
    phone: "+254712345678",
    whatsapp: "",
    nationalId: "12345678",
    ...overrides,
  };
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/users/me", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/users/me"));
    expect(res.status).toBe(401);
  });

  it("returns the caller's contact and identity fields", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await GET(buildRequest("/api/v1/users/me", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toMatchObject({
      id: USER_ID,
      role: "tenant",
      phone: "+254712345678",
      whatsapp: "",
      nationalId: "12345678",
    });
  });
});

describe("PATCH /api/v1/users/me", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await PATCH(
      buildRequest("/api/v1/users/me", { method: "PATCH", body: { name: "New Name" } }),
    );
    expect(res.status).toBe(401);
  });

  it("400 when the mobile number lacks a valid country code", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await PATCH(
      buildRequest("/api/v1/users/me", {
        method: "PATCH",
        token: signToken(USER_ID),
        body: { phone: "0712345678" },
      }),
    );
    expect(res.status).toBe(400);
    expect(user.updateOne).not.toHaveBeenCalled();
  });

  it("400 when the name is too short", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await PATCH(
      buildRequest("/api/v1/users/me", {
        method: "PATCH",
        token: signToken(USER_ID),
        body: { name: "A" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("updates the contact fields and normalises the national id", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(tenantDoc()))
      .mockReturnValueOnce(
        buildQuery(tenantDoc({ phone: "+254733111222", whatsapp: "+254733111222" })),
      );

    const res = await PATCH(
      buildRequest("/api/v1/users/me", {
        method: "PATCH",
        token: signToken(USER_ID),
        body: {
          name: "Amina Otieno",
          phone: "+254733111222",
          whatsapp: "+254733111222",
          nationalId: "12-345 678",
        },
      }),
    );

    expect(res.status).toBe(200);
    const [filter, update] = user.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: USER_ID });
    expect(update).toEqual({
      $set: {
        name: "Amina Otieno",
        phone: "+254733111222",
        whatsapp: "+254733111222",
        nationalId: "12345678",
      },
    });
  });

  it("allows clearing the WhatsApp number to fall back to mobile", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await PATCH(
      buildRequest("/api/v1/users/me", {
        method: "PATCH",
        token: signToken(USER_ID),
        body: { whatsapp: "" },
      }),
    );
    expect(res.status).toBe(200);
    const [, update] = user.updateOne.mock.calls[0];
    expect(update).toEqual({ $set: { whatsapp: "" } });
  });

  it("does not call updateOne when the payload is empty", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await PATCH(
      buildRequest("/api/v1/users/me", { method: "PATCH", token: signToken(USER_ID), body: {} }),
    );
    expect(res.status).toBe(200);
    expect(user.updateOne).not.toHaveBeenCalled();
  });
});
