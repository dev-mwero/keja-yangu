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
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/MoveRequest", () => ({ MoveRequest: getModelStubs().moverrequest }));

import { GET, POST } from "@/app/api/v1/move-requests/route";

const { user, property, tenant, moverrequest } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const CARETAKER_ID = makeObjectId("caretaker");
const TENANT_ID = makeObjectId("tenant");
const PROP_ID = makeObjectId("prop");
const TENANT_DOC_ID = makeObjectId("tenantdoc");

function listResult(docs: unknown[]) {
  moverrequest.find.mockReturnValue(buildQuery(docs));
  moverrequest.countDocuments.mockResolvedValue(docs.length);
}

describe("GET /api/v1/move-requests", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/move-requests"));
    expect(res.status).toBe(401);
  });

  it("scopes an owner to requests against their portfolio", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    listResult([]);
    const res = await GET(buildRequest("/api/v1/move-requests", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(moverrequest.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("scopes a tenant to their own requests", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    listResult([]);
    const res = await GET(buildRequest("/api/v1/move-requests", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(200);
    expect(moverrequest.find).toHaveBeenCalledWith({ requestedById: TENANT_ID });
  });

  it("scopes a custodian to their managing owner", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OWNER_ID })),
    );
    listResult([]);
    const res = await GET(
      buildRequest("/api/v1/move-requests", { token: signToken(CUSTODIAN_ID) }),
    );
    expect(res.status).toBe(200);
    expect(moverrequest.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("scopes a caretaker to assigned properties of the managing owner", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CARETAKER_ID, role: "caretaker", managedByOwnerId: OWNER_ID })),
    );
    property.find.mockReturnValue(buildQuery([{ _id: PROP_ID }]));
    listResult([]);

    const res = await GET(
      buildRequest("/api/v1/move-requests", { token: signToken(CARETAKER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(property.find).toHaveBeenCalledWith({
      caretakerIds: CARETAKER_ID,
      ownerId: OWNER_ID,
    });
    expect(moverrequest.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      propertyId: { $in: [PROP_ID] },
    });
  });

  it("enriches results with property titles and requester names", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const mr = {
      _id: makeObjectId("mr"),
      type: "move-in",
      propertyId: PROP_ID,
      ownerId: OWNER_ID,
      requestedById: TENANT_ID,
      requestedByRole: "tenant",
      status: "pending",
    };
    listResult([mr]);
    property.find.mockReturnValue(buildQuery([{ _id: PROP_ID, title: "Sunset Villa" }]));
    user.find.mockReturnValue(buildQuery([{ _id: TENANT_ID, name: "Amina" }]));

    const res = await GET(buildRequest("/api/v1/move-requests", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0]).toMatchObject({
      propertyTitle: "Sunset Villa",
      requestedByName: "Amina",
    });
  });
});

describe("POST /api/v1/move-requests", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("/api/v1/move-requests", {
        method: "POST",
        body: { type: "move-out", propertyId: PROP_ID },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("400 for an invalid payload", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await POST(
      buildRequest("/api/v1/move-requests", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { type: "move-sideways", propertyId: PROP_ID },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("403 when a tenant has no tenancy on the property", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(buildQuery({ _id: PROP_ID, ownerId: OWNER_ID }));
    tenant.findOne.mockReturnValue(buildQuery(null));

    const res = await POST(
      buildRequest("/api/v1/move-requests", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { type: "move-out", propertyId: PROP_ID },
      }),
    );
    expect(res.status).toBe(403);
    expect(moverrequest.create).not.toHaveBeenCalled();
  });

  it("lets an occupying tenant file a move-out request", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(buildQuery({ _id: PROP_ID, ownerId: OWNER_ID }));
    tenant.findOne.mockReturnValue(buildQuery({ _id: TENANT_DOC_ID }));
    moverrequest.create.mockResolvedValue({ _id: makeObjectId("mr") });

    const res = await POST(
      buildRequest("/api/v1/move-requests", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { type: "move-out", propertyId: PROP_ID, unitId: makeObjectId("unit") },
      }),
    );
    expect(res.status).toBe(201);
    expect(moverrequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        requestedById: TENANT_ID,
        requestedByRole: "tenant",
        tenantId: TENANT_DOC_ID,
        status: "pending",
      }),
    );
  });

  it("lets a tenant file by email match and heals the tenancy link", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: TENANT_ID, role: "tenant", email: "amina@keja.co" })),
    );
    property.findById.mockReturnValue(buildQuery({ _id: PROP_ID, ownerId: OWNER_ID }));
    // First lookup (by userId) misses, second (by email) hits.
    tenant.findOne
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery({ _id: TENANT_DOC_ID }));
    moverrequest.create.mockResolvedValue({ _id: makeObjectId("mr") });

    const res = await POST(
      buildRequest("/api/v1/move-requests", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { type: "move-out", propertyId: PROP_ID, unitId: makeObjectId("unit") },
      }),
    );
    expect(res.status).toBe(201);
    expect(tenant.findOne).toHaveBeenNthCalledWith(2, {
      email: "amina@keja.co",
      propertyId: PROP_ID,
    });
    expect(tenant.updateOne).toHaveBeenCalledWith(
      { _id: TENANT_DOC_ID },
      { $set: { userId: TENANT_ID } },
    );
    expect(moverrequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_DOC_ID, ownerId: OWNER_ID }),
    );
  });

  it("lets an owner file against their own property", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    property.findById.mockReturnValue(buildQuery({ _id: PROP_ID, ownerId: OWNER_ID }));
    moverrequest.create.mockResolvedValue({ _id: makeObjectId("mr") });

    const res = await POST(
      buildRequest("/api/v1/move-requests", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { type: "move-in", propertyId: PROP_ID },
      }),
    );
    expect(res.status).toBe(201);
    expect(moverrequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        requestedById: OWNER_ID,
        requestedByRole: "owner",
      }),
    );
  });

  it("403 when an owner files against a foreign property", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    property.findById.mockReturnValue(buildQuery({ _id: PROP_ID, ownerId: makeObjectId("other") }));

    const res = await POST(
      buildRequest("/api/v1/move-requests", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { type: "move-in", propertyId: PROP_ID },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("lets a custodian file against their managing owner's property", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OWNER_ID })),
    );
    property.findById.mockReturnValue(buildQuery({ _id: PROP_ID, ownerId: OWNER_ID }));
    moverrequest.create.mockResolvedValue({ _id: makeObjectId("mr") });

    const res = await POST(
      buildRequest("/api/v1/move-requests", {
        method: "POST",
        token: signToken(CUSTODIAN_ID),
        body: { type: "move-out", propertyId: PROP_ID },
      }),
    );
    expect(res.status).toBe(201);
  });
});
