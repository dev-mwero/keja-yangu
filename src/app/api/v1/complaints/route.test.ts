/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeComplaint, makeObjectId, makeTenant, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Complaint", () => ({ Complaint: getModelStubs().complaint }));

import { GET, POST } from "@/app/api/v1/complaints/route";

const { user, property, tenant, complaint } = getModelStubs();

const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("owner");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const COMPLAINT_ID = makeObjectId("complaint");

function tenantUser() {
  return makeUser({ _id: USER_ID, role: "tenant" });
}

function ownerUser() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/complaints", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/complaints"));
    expect(res.status).toBe(401);
  });

  it("400 for an invalid status filter", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    const res = await GET(
      buildRequest("/api/v1/complaints?status=bogus", { token: signToken(USER_ID) }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid complaint status");
  });

  it("scopes to the tenant's bound rows and enriches the property title", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID })]),
    );
    const row = makeComplaint({
      _id: COMPLAINT_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
    });
    complaint.find.mockReturnValue(buildQuery([row]).sort({ createdAt: -1 }).skip(0).limit(20));
    complaint.countDocuments.mockResolvedValue(1);
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));

    const res = await GET(buildRequest("/api/v1/complaints", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    expect(complaint.find).toHaveBeenCalledWith({ tenantId: { $in: [TENANT_ID] } });
    const body = await json(res);
    const data = body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0]._id).toBe(COMPLAINT_ID);
    expect(data[0].property).toBe("Sunlit Studio");
  });

  it("filters by the status query", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID })]),
    );
    complaint.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    complaint.countDocuments.mockResolvedValue(0);
    property.find.mockReturnValue(buildQuery([]));

    await GET(buildRequest("/api/v1/complaints?status=open", { token: signToken(USER_ID) }));
    expect(complaint.find).toHaveBeenCalledWith({ tenantId: { $in: [TENANT_ID] }, status: "open" });
  });

  it("owner scopes by their own id", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    complaint.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    complaint.countDocuments.mockResolvedValue(0);
    property.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/complaints", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(complaint.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("caretaker scopes to managed owner + assigned properties", async () => {
    const caretaker = makeUser({
      _id: makeObjectId("caretaker"),
      role: "caretaker",
      managedByOwnerId: OWNER_ID,
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));
    complaint.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    complaint.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/complaints", { token: signToken(caretaker._id) }));
    expect(res.status).toBe(200);
    expect(complaint.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      propertyId: { $in: [PROPERTY_ID] },
    });
  });

  it("tenant with no bound rows gets an empty page", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/complaints", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual([]);
    expect((body.pagination as { total: number }).total).toBe(0);
    expect(complaint.find).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/complaints", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/complaints", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });

  it("403 for a mismatched origin", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    const res = await POST(
      buildRequest("/api/v1/complaints", {
        method: "POST",
        token: signToken(USER_ID),
        headers: { origin: "http://evil.example" },
        body: {},
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid payload", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    const res = await POST(
      buildRequest("/api/v1/complaints", {
        method: "POST",
        token: signToken(USER_ID),
        body: { subject: "  " },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("403 when a non-tenant posts", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    const res = await POST(
      buildRequest("/api/v1/complaints", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { subject: "Leak", category: "Maintenance", message: "Leaking", priority: "low" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("403 when the tenant has no bound rows", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(buildQuery([]));
    const res = await POST(
      buildRequest("/api/v1/complaints", {
        method: "POST",
        token: signToken(USER_ID),
        body: { subject: "Leak", category: "Maintenance", message: "Leaking", priority: "low" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("pins the single-property tenant's property and creates an open complaint", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([
        makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, ownerId: OWNER_ID, userId: USER_ID }),
      ]),
    );
    const created = makeComplaint({
      _id: COMPLAINT_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      status: "open",
    });
    complaint.create.mockResolvedValue(created);
    complaint.findById.mockReturnValue(buildQuery(created));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));

    const res = await POST(
      buildRequest("/api/v1/complaints", {
        method: "POST",
        token: signToken(USER_ID),
        body: { subject: "Leak", category: "Maintenance", message: "Leaking", priority: "low" },
      }),
    );
    expect(res.status).toBe(201);
    expect(complaint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        ownerId: OWNER_ID,
        subject: "Leak",
        category: "Maintenance",
        priority: "low",
        status: "open",
      }),
    );
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("open");
  });

  it("400 when a multi-property tenant omits the property", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([
        makeTenant({ _id: makeObjectId("t1"), propertyId: makeObjectId("p1"), userId: USER_ID }),
        makeTenant({ _id: makeObjectId("t2"), propertyId: makeObjectId("p2"), userId: USER_ID }),
      ]),
    );
    const res = await POST(
      buildRequest("/api/v1/complaints", {
        method: "POST",
        token: signToken(USER_ID),
        body: { subject: "Leak", category: "Maintenance", message: "Leaking", priority: "low" },
      }),
    );
    expect(res.status).toBe(400);
    expect(complaint.create).not.toHaveBeenCalled();
  });

  it("403 when a multi-property tenant pins a foreign property", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([
        makeTenant({ _id: makeObjectId("t1"), propertyId: makeObjectId("p1"), userId: USER_ID }),
        makeTenant({ _id: makeObjectId("t2"), propertyId: makeObjectId("p2"), userId: USER_ID }),
      ]),
    );
    const res = await POST(
      buildRequest("/api/v1/complaints", {
        method: "POST",
        token: signToken(USER_ID),
        body: {
          subject: "Leak",
          category: "Maintenance",
          message: "Leaking",
          priority: "low",
          propertyId: makeObjectId("foreign"),
        },
      }),
    );
    expect(res.status).toBe(403);
  });
});
