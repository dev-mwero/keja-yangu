/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeDocument, makeObjectId, makeTenant, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/PropertyDocument", () => ({
  PropertyDocument: getModelStubs().propertydocument,
}));

import { GET, POST } from "@/app/api/v1/documents/route";

const { user, property, tenant, propertydocument } = getModelStubs();

const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("owner");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const DOC_ID = makeObjectId("document");

function tenantUser() {
  return makeUser({ _id: USER_ID, role: "tenant" });
}

function ownerUser() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/documents", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/documents"));
    expect(res.status).toBe(401);
  });

  it("scopes tenant reads to bound tenant rows and shared property docs", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID })]),
    );
    propertydocument.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    propertydocument.countDocuments.mockResolvedValue(0);
    property.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/documents", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    expect(propertydocument.find).toHaveBeenCalledWith({
      $or: [
        { scope: "tenant", tenantId: { $in: [TENANT_ID] } },
        { scope: "property", propertyId: { $in: [PROPERTY_ID] } },
      ],
    });
  });

  it("serializes size, uploadedBy and uploadedAt", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID })]),
    );
    const row = makeDocument({
      _id: DOC_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      uploadedByName: "D8 Property Group",
      sizeLabel: "1.4 MB",
      scope: "tenant",
    });
    propertydocument.find.mockReturnValue(
      buildQuery([row]).sort({ createdAt: -1 }).skip(0).limit(20),
    );
    propertydocument.countDocuments.mockResolvedValue(1);
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));

    const res = await GET(buildRequest("/api/v1/documents", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    const data = body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0]._id).toBe(DOC_ID);
    expect(data[0].size).toBe("1.4 MB");
    expect(data[0].uploadedBy).toBe("D8 Property Group");
    expect(data[0].property).toBe("Sunlit Studio");
    expect(data[0].uploadedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("owner scopes to their own records", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    propertydocument.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    propertydocument.countDocuments.mockResolvedValue(0);
    property.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/documents", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(propertydocument.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("caretaker scopes to the managed owner's assigned properties", async () => {
    const CARETAKER_ID = makeObjectId("document-caretaker");
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CARETAKER_ID, role: "caretaker", managedByOwnerId: OWNER_ID })),
    );
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));
    propertydocument.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    propertydocument.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/documents", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    expect(propertydocument.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      propertyId: { $in: [PROPERTY_ID] },
    });
  });

  it("tenant with no bound rows gets an empty page", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/documents", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual([]);
    expect(propertydocument.find).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/documents", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/documents", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });

  it("403 when a tenant creates a document", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(buildQuery([]));

    const res = await POST(
      buildRequest("/api/v1/documents", {
        method: "POST",
        token: signToken(USER_ID),
        body: { name: "Lease", category: "lease" },
      }),
    );
    expect(res.status).toBe(403);
    expect(propertydocument.create).not.toHaveBeenCalled();
  });

  it("400 for an invalid payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));

    const res = await POST(
      buildRequest("/api/v1/documents", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "", category: "lease" },
      }),
    );
    expect(res.status).toBe(400);
    expect(propertydocument.create).not.toHaveBeenCalled();
  });

  it("400 when a tenant-scope document omits the tenant", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));

    const res = await POST(
      buildRequest("/api/v1/documents", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "Lease", category: "lease", scope: "tenant" },
      }),
    );
    expect(res.status).toBe(400);
    expect(propertydocument.create).not.toHaveBeenCalled();
  });

  it("owner creates a portfolio-wide document stamped to their account", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValueOnce(buildQuery({ _id: OWNER_ID, name: "Test Owner" }));
    const created = makeDocument({
      _id: DOC_ID,
      ownerId: OWNER_ID,
      propertyId: "",
      tenantId: "",
      scope: "landlord",
      name: "2026 lease template",
      category: "lease",
      uploadedById: OWNER_ID,
      uploadedByName: "Test Owner",
      sizeLabel: "—",
    });
    propertydocument.create.mockResolvedValue(created);
    propertydocument.findById.mockReturnValue(buildQuery(created));
    property.find.mockReturnValue(buildQuery([]));

    const res = await POST(
      buildRequest("/api/v1/documents", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "2026 lease template", category: "lease" },
      }),
    );

    expect(res.status).toBe(201);
    expect(propertydocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "2026 lease template",
        ownerId: OWNER_ID,
        scope: "landlord",
        propertyId: "",
        uploadedById: OWNER_ID,
        uploadedByName: "Test Owner",
      }),
    );
    const body = await json(res);
    expect((body.data as { _id?: string })._id).toBe(DOC_ID);
  });

  it("404 when the owner targets a property that does not exist", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValueOnce(buildQuery(ownerUser()));
    property.findById.mockReturnValue(buildQuery(null));

    const res = await POST(
      buildRequest("/api/v1/documents", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "Lease", category: "lease", scope: "property", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(404);
    await expect(json(res)).resolves.toEqual({ error: "Property not found" });
    expect(propertydocument.create).not.toHaveBeenCalled();
  });

  it("403 when the owner targets another owner's property", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValueOnce(buildQuery(ownerUser()));
    property.findById.mockReturnValue(buildQuery({ _id: PROPERTY_ID, ownerId: USER_ID }));

    const res = await POST(
      buildRequest("/api/v1/documents", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "Lease", category: "lease", scope: "property", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(403);
    expect(propertydocument.create).not.toHaveBeenCalled();
  });
});
