/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeTenant, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({
  Tenant: getModelStubs().tenant,
  TENANT_SAFE_FIELDS:
    "name email phone propertyId ownerId status joinedAt notes createdAt updatedAt",
}));

import { DELETE, GET, PATCH } from "@/app/api/v1/tenants/[id]/route";

const { user, property, tenant: tenantStub } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const PROPERTY_ID = makeObjectId("p1");
const OTHER_PROPERTY_ID = makeObjectId("p2");
const TENANT_ID = makeObjectId("t1");
const INVALID_ID = "not-an-objectid";

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerDoc(privileges: string[]) {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: privileges as ReturnType<typeof makeUser>["privileges"],
  });
}

function inScopeTenant() {
  return makeTenant({
    _id: TENANT_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    status: "active",
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/tenants/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid id", async () => {
    const res = await GET(buildRequest(`/api/v1/tenants/${INVALID_ID}`), withParams(INVALID_ID));
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest(`/api/v1/tenants/${TENANT_ID}`), withParams(TENANT_ID));
    expect(res.status).toBe(401);
  });

  it("403 for a default caretaker (C0)", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc([])));
    const res = await GET(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, { token: signToken(CARETAKER_ID) }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(403);
  });

  it("200 for an in-scope tenant", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(buildQuery(inScopeTenant()));
    const res = await GET(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, { token: signToken(OWNER_ID) }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as { ownerId?: string }).ownerId).toBe(OWNER_ID);
  });

  it("404 for a cross-owner read (existence hidden)", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await GET(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, { token: signToken(OWNER_ID) }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(404);
  });

  it("404 when absent", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, { token: signToken(OWNER_ID) }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/tenants/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("owner updates a tenant name in scope", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(buildQuery(inScopeTenant()));
    const updated = { ...inScopeTenant(), name: "Renamed Tenant" };
    tenantStub.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { name: "Renamed Tenant" },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: TENANT_ID },
      { name: "Renamed Tenant" },
      expect.any(Object),
    );
  });

  it("ownerId in the payload is stripped and never persisted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(buildQuery(inScopeTenant()));
    const updated = { ...inScopeTenant(), phone: "+254700000000" };
    tenantStub.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { phone: "+254700000000", ownerId: makeObjectId("spoof") },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(200);
    const updateData = tenantStub.findOneAndUpdate.mock.calls[0][1] as {
      phone?: string;
      ownerId?: string;
    };
    expect(updateData.phone).toBe("+254700000000");
    expect(updateData.ownerId).toBeUndefined();
  });

  it("caretakers cannot set tenant status", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["manage_tenants"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    tenantStub.findById.mockReturnValue(buildQuery(inScopeTenant()));

    const res = await PATCH(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "PATCH",
        token: signToken(CARETAKER_ID),
        body: { status: "rejected" },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(403);
    expect(tenantStub.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("403 when a caretaker reassigns to a property outside their scope", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["manage_tenants"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    tenantStub.findById.mockReturnValue(buildQuery(inScopeTenant()));
    // target property is NOT assigned to this caretaker
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: OTHER_PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [] })),
    );

    const res = await PATCH(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "PATCH",
        token: signToken(CARETAKER_ID),
        body: { propertyId: OTHER_PROPERTY_ID },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(403);
  });

  it("422 when reassigning to a property that does not exist", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(buildQuery(inScopeTenant()));
    property.findById.mockReturnValue(buildQuery(null));

    const res = await PATCH(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { propertyId: OTHER_PROPERTY_ID },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(422);
  });

  it("409 when the new email already exists on the target property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(buildQuery(inScopeTenant()));
    tenantStub.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("other-tenant") }));

    const res = await PATCH(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { email: "taken@keja.co" },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(409);
    expect(tenantStub.findOne).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      email: "taken@keja.co",
    });
  });

  it("owner can change status and joinedAt updates accordingly", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(buildQuery({ ...inScopeTenant(), status: "pending" }));
    const updated = { ...inScopeTenant(), status: "active" };
    tenantStub.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "active" },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(200);
    const updateData = tenantStub.findOneAndUpdate.mock.calls[0][1] as {
      status?: string;
      joinedAt?: unknown;
    };
    expect(updateData.status).toBe("active");
    expect(updateData.joinedAt).toBeInstanceOf(Date);
  });

  it("400 for an invalid email shape", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(buildQuery(inScopeTenant()));
    const res = await PATCH(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { email: "not-an-email" },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 for a cross-owner tenant", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await PATCH(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { name: "X" },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/tenants/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("owner deletes an in-scope tenant", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(buildQuery(inScopeTenant()));
    tenantStub.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await DELETE(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.deleteOne).toHaveBeenCalledWith({ _id: TENANT_ID });
    const body = await json(res);
    expect(body.message).toBe("Tenant deleted");
  });

  it("404 for a cross-owner delete", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await DELETE(
      buildRequest(`/api/v1/tenants/${TENANT_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(404);
    expect(tenantStub.deleteOne).not.toHaveBeenCalled();
  });
});
