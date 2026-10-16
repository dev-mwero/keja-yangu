/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/OwnerPaymentConfig", () => ({
  OwnerPaymentConfig: getModelStubs().ownerpaymentconfig,
}));

import { GET, PUT } from "@/app/api/v1/owner/payment-config/route";

const { user, ownerpaymentconfig: configStub } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const TENANT_ID = makeObjectId("tenant");
const URL = "/api/v1/owner/payment-config";

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function tenantDoc() {
  return makeUser({ _id: TENANT_ID, role: "tenant" });
}

function completeConfig() {
  return {
    ownerId: OWNER_ID,
    darajaEnabled: true,
    daraja: {
      environment: "sandbox",
      consumerKey: "enc:v1:ck",
      consumerSecret: "enc:v1:cs",
      passphrase: "enc:v1:pp",
      shortcode: "174379",
    },
  };
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/owner/payment-config", () => {
  beforeEach(() => resetModelStubs());

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest(URL, { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("403 for a non-owner", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await GET(buildRequest(URL, { method: "GET", token: signToken(TENANT_ID) }));
    expect(res.status).toBe(403);
  });

  it("returns a masked view with availability", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    configStub.findOne.mockReturnValue(buildQuery(completeConfig()));

    const res = await GET(buildRequest(URL, { method: "GET", token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    const data = body.data as {
      daraja: Record<string, unknown>;
      mpesaConfigured: boolean;
      availableMethods: string[];
    };
    expect(data.mpesaConfigured).toBe(true);
    expect(data.daraja.consumerKeyConfigured).toBe(true);
    expect(data.daraja).not.toHaveProperty("consumerKey");
    expect(data.availableMethods).toContain("manual");
    expect(data.availableMethods).toContain("mpesa");
  });

  it("defaults to manual-only when the owner has no config", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    configStub.findOne.mockReturnValue(buildQuery(null));

    const res = await GET(buildRequest(URL, { method: "GET", token: signToken(OWNER_ID) }));
    const body = await json(res);
    const data = body.data as { availableMethods: string[] };
    expect(data.availableMethods).toEqual(["manual"]);
  });
});

describe("PUT /api/v1/owner/payment-config", () => {
  beforeEach(() => resetModelStubs());

  it("403 for a mismatched origin", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await PUT(
      buildRequest(URL, {
        method: "PUT",
        token: signToken(OWNER_ID),
        headers: { origin: "http://evil.example" },
        body: {},
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await PUT(
      buildRequest(URL, {
        method: "PUT",
        token: signToken(OWNER_ID),
        body: { daraja: { environment: "moon" } },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid payment config payload");
    expect(configStub.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("upserts the config and returns the masked view", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    configStub.findOne
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery(completeConfig()));
    configStub.findOneAndUpdate.mockResolvedValue(completeConfig());

    const res = await PUT(
      buildRequest(URL, {
        method: "PUT",
        token: signToken(OWNER_ID),
        body: {
          darajaEnabled: true,
          daraja: {
            environment: "sandbox",
            consumerKey: "ck",
            consumerSecret: "cs",
            passphrase: "pp",
            shortcode: "174379",
          },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(configStub.findOneAndUpdate).toHaveBeenCalledWith(
      { ownerId: OWNER_ID },
      expect.objectContaining({ $set: expect.any(Object) }),
      expect.objectContaining({ upsert: true }),
    );
    const body = await json(res);
    expect((body.data as { mpesaConfigured: boolean }).mpesaConfigured).toBe(true);
  });
});
