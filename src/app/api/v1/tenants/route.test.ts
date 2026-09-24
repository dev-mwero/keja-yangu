/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
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

import { GET, POST } from "@/app/api/v1/tenants/route";

const { user, property, tenant: tenantStub } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const ADMIN_ID = makeObjectId("admin");
const PROPERTY_ID = makeObjectId("p1");
const TENANT_ID = makeObjectId("t1");

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function adminDoc() {
  return makeUser({ _id: ADMIN_ID, role: "system-admin" });
}

function caretakerDoc(privileges: string[]) {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: privileges as ReturnType<typeof makeUser>["privileges"],
  });
}

function ownedProperty() {
  return makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] });
}

const tenantInput = {
  name: "Amina Otieno",
  email: "amina@keja.co",
  propertyId: PROPERTY_ID,
};

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/tenants", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/tenants"));
    expect(res.status).toBe(401);
  });

  it("403 for a default caretaker (C0)", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc([])));
    const res = await GET(buildRequest("/api/v1/tenants", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(403);
  });

  it("owner sees only their own tenants", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const rows = [makeTenant({ _id: TENANT_ID, ownerId: OWNER_ID })];
    const chain = buildQuery(rows);
    tenantStub.find.mockReturnValue(chain);
    tenantStub.countDocuments.mockResolvedValue(1);

    const res = await GET(buildRequest("/api/v1/tenants", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(tenantStub.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(tenantStub.countDocuments).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(chain.select).toHaveBeenCalledWith(
      "name email phone propertyId ownerId status joinedAt notes createdAt updatedAt",
    );
    const body = await json(res);
    expect((body.data as Array<{ ownerId: string }>)[0].ownerId).toBe(OWNER_ID);
  });

  it("403 when an owner requests a foreign ownerId filter", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await GET(
      buildRequest(`/api/v1/tenants?ownerId=${makeObjectId("other")}`, {
        token: signToken(OWNER_ID),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("owner may pass their own ownerId filter", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.find.mockReturnValue(buildQuery([]));
    tenantStub.countDocuments.mockResolvedValue(0);
    const res = await GET(
      buildRequest(`/api/v1/tenants?ownerId=${OWNER_ID}&status=active&propertyId=${PROPERTY_ID}`, {
        token: signToken(OWNER_ID),
      }),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      status: "active",
      propertyId: PROPERTY_ID,
    });
  });

  it("system-admin sees all tenants and may filter by any ownerId", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    tenantStub.find.mockReturnValue(buildQuery([]));
    tenantStub.countDocuments.mockResolvedValue(0);
    const res = await GET(
      buildRequest(`/api/v1/tenants?ownerId=${OWNER_ID}`, { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("caretaker C4 sees only assigned properties of the managing owner", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["manage_tenants"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    tenantStub.find.mockReturnValue(buildQuery([]));
    tenantStub.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/tenants", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    expect(tenantStub.find).toHaveBeenCalledWith({
      propertyId: { $in: [PROPERTY_ID] },
      ownerId: OWNER_ID,
    });
  });
});

describe("POST /api/v1/tenants", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 when the Origin header does not match the app origin", async () => {
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { origin: "https://evil.example" },
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/tenants", { method: "POST", body: tenantInput }));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker without manage_tenants", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc([])));
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("owner creates a tenant on their own property with ownerId from the property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({
      _id: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      status: "pending",
    });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.data as { ownerId?: string }).ownerId).toBe(OWNER_ID);
    expect(tenantStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        status: "pending",
        joinedAt: undefined,
      }),
    );
  });

  it("owner create passes through an explicit active status and sets joinedAt", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({ _id: TENANT_ID, status: "active" });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { ...tenantInput, status: "active" },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = tenantStub.create.mock.calls[0][0] as { status?: string; joinedAt?: Date };
    expect(createArgs.status).toBe("active");
    expect(createArgs.joinedAt).toBeInstanceOf(Date);
  });

  it("403 when an owner targets a foreign property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: makeObjectId("other") })),
    );
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(403);
    expect(tenantStub.create).not.toHaveBeenCalled();
  });

  it("422 when the property does not exist", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(422);
  });

  it("system-admin can create on any property", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({ _id: TENANT_ID, status: "rejected" });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { ...tenantInput, status: "rejected" },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = tenantStub.create.mock.calls[0][0] as { status?: string };
    expect(createArgs.status).toBe("rejected");
  });

  it("caretaker C4 can create on an assigned property and status is forced to pending", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["manage_tenants"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({ _id: TENANT_ID, status: "pending" });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: { ...tenantInput, status: "active" },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = tenantStub.create.mock.calls[0][0] as { status?: string };
    expect(createArgs.status).toBe("pending");
  });

  it("403 for caretaker C4 on an unassigned property", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["manage_tenants"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [] })),
    );
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("409 when a duplicate { propertyId, email } already exists", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("existing") }));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(409);
    expect(tenantStub.findOne).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      email: tenantInput.email,
    });
    expect(tenantStub.create).not.toHaveBeenCalled();
  });

  it("400 when propertyId is not a 24-hex ObjectId", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { ...tenantInput, propertyId: "short" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(null)); // 422 path — cheap, no create
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        buildRequest("/api/v1/tenants", {
          method: "POST",
          token: signToken(OWNER_ID),
          headers: { "x-forwarded-for": "203.0.113.77" },
          body: tenantInput,
        }),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
