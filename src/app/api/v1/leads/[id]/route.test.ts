/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeLead, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Lead", () => ({ Lead: getModelStubs().lead }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));

import { GET, PATCH } from "@/app/api/v1/leads/[id]/route";

const { user, lead, tenant, managementAssignment } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const TENANT_ID = makeObjectId("tenant");
const LEAD_ID = makeObjectId("l1");

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

const existingLead = makeLead({ _id: LEAD_ID, ownerId: OWNER_ID, status: "new" });

describe("GET /api/v1/leads/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/leads/x"), withParams(LEAD_ID));
    expect(res.status).toBe(401);
  });

  it("403 for a tenant actor", async () => {
    const tenantActor = makeUser({ _id: TENANT_ID, role: "tenant" });
    user.findById.mockReturnValue(buildQuery(tenantActor));
    const res = await GET(
      buildRequest("/api/v1/leads/x", { token: signToken(TENANT_ID) }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a caretaker", async () => {
    const caretaker = makeUser({
      _id: CARETAKER_ID,
      role: "caretaker",
      managedByOwnerId: OWNER_ID,
      privileges: [],
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    const res = await GET(
      buildRequest("/api/v1/leads/x", { token: signToken(CARETAKER_ID) }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(403);
  });

  it("200 for an owner scoped to their lead", async () => {
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["lead:read", "lead:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const owner = makeUser({ _id: OWNER_ID, role: "admin" });
    user.findById.mockReturnValue(buildQuery(owner));
    lead.findOne.mockReturnValue(buildQuery(existingLead));

    const res = await GET(
      buildRequest("/api/v1/leads/x", { token: signToken(OWNER_ID) }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(200);
    expect(lead.findOne).toHaveBeenCalledWith({
      _id: LEAD_ID,
      $or: [{ propertyId: { $in: [makeObjectId("prop")] } }],
    });
    const body = await json(res);
    expect(body.data as Record<string, unknown>).toEqual(existingLead);
  });

  it("scopes an admin to leads on assigned properties or units", async () => {
    const PROP_ID = makeObjectId("property");
    const SCOPED_ADMIN_ID = makeObjectId("scoped-admin");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: SCOPED_ADMIN_ID, role: "admin" })));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: SCOPED_ADMIN_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: PROP_ID,
          permissions: ["lead:read"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const propLead = makeLead({ _id: LEAD_ID, propertyId: PROP_ID, ownerId: OWNER_ID });
    lead.findOne.mockReturnValue(buildQuery(propLead));

    const res = await GET(
      buildRequest("/api/v1/leads/x", { token: signToken(SCOPED_ADMIN_ID) }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(200);
    expect(lead.findOne).toHaveBeenCalledWith({
      _id: LEAD_ID,
      $or: [{ propertyId: { $in: [PROP_ID] } }],
    });
  });

  it("404 when the lead is not in the actor's portfolio", async () => {
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["lead:read", "lead:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const owner = makeUser({ _id: OWNER_ID, role: "admin" });
    user.findById.mockReturnValue(buildQuery(owner));
    lead.findOne.mockReturnValue(buildQuery(null));

    const res = await GET(
      buildRequest("/api/v1/leads/x", { token: signToken(OWNER_ID) }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/leads/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await PATCH(
      buildRequest("/api/v1/leads/x", { method: "PATCH", body: { status: "contacted" } }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker without manage_tenants", async () => {
    const caretaker = makeUser({
      _id: CARETAKER_ID,
      role: "caretaker",
      managedByOwnerId: OWNER_ID,
      privileges: [],
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    const res = await PATCH(
      buildRequest("/api/v1/leads/x", {
        method: "PATCH",
        body: { status: "contacted" },
        token: signToken(CARETAKER_ID),
      }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid status", async () => {
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["lead:read", "lead:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const owner = makeUser({ _id: OWNER_ID, role: "admin" });
    user.findById.mockReturnValue(buildQuery(owner));
    lead.findOne.mockReturnValue(buildQuery(existingLead));

    const res = await PATCH(
      buildRequest("/api/v1/leads/x", {
        method: "PATCH",
        body: { status: "archived" },
        token: signToken(OWNER_ID),
      }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 when the lead is not found", async () => {
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["lead:read", "lead:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const owner = makeUser({ _id: OWNER_ID, role: "admin" });
    user.findById.mockReturnValue(buildQuery(owner));
    lead.findOne.mockReturnValue(buildQuery(null));

    const res = await PATCH(
      buildRequest("/api/v1/leads/x", {
        method: "PATCH",
        body: { status: "contacted" },
        token: signToken(OWNER_ID),
      }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(404);
  });

  it("409 on an invalid status transition", async () => {
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["lead:read", "lead:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const owner = makeUser({ _id: OWNER_ID, role: "admin" });
    user.findById.mockReturnValue(buildQuery(owner));
    const rejectedLead = makeLead({ _id: LEAD_ID, ownerId: OWNER_ID, status: "rejected" });
    lead.findOne.mockReturnValue(buildQuery(rejectedLead));

    const res = await PATCH(
      buildRequest("/api/v1/leads/x", {
        method: "PATCH",
        body: { status: "contacted" },
        token: signToken(OWNER_ID),
      }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(409);
  });

  it("advances new -> contacted", async () => {
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["lead:read", "lead:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const owner = makeUser({ _id: OWNER_ID, role: "admin" });
    user.findById.mockReturnValue(buildQuery(owner));
    const updated = makeLead({ _id: LEAD_ID, ownerId: OWNER_ID, status: "contacted" });
    lead.findOne.mockReturnValue(buildQuery(existingLead));
    lead.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest("/api/v1/leads/x", {
        method: "PATCH",
        body: { status: "contacted" },
        token: signToken(OWNER_ID),
      }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(200);
    expect(lead.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: LEAD_ID,
        $or: [{ propertyId: { $in: [makeObjectId("prop")] } }],
      },
      { status: "contacted" },
      { new: true },
    );
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("contacted");
  });

  it("converts an approved lead and creates a Tenant row", async () => {
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["lead:read", "lead:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const owner = makeUser({ _id: OWNER_ID, role: "admin" });
    user.findById.mockReturnValue(buildQuery(owner));
    const approvedLead = makeLead({
      _id: LEAD_ID,
      ownerId: OWNER_ID,
      status: "approved",
      name: "Jane Doe",
      phone: "+254700000000",
      email: "jane@example.com",
      propertyId: makeObjectId("prop"),
      notes: "Interested in unit 3A",
    });
    const createdTenant = { _id: makeObjectId("t-converted") };
    lead.findOne.mockReturnValue(buildQuery(approvedLead));
    tenant.create.mockResolvedValue(createdTenant);
    const updated = makeLead({
      _id: LEAD_ID,
      ownerId: OWNER_ID,
      status: "converted",
    });
    lead.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest("/api/v1/leads/x", {
        method: "PATCH",
        body: { status: "converted" },
        token: signToken(OWNER_ID),
      }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(200);
    expect(tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Jane Doe",
        phone: "+254700000000",
        email: "jane@example.com",
        ownerId: OWNER_ID,
        status: "active",
        type: "residential",
      }),
    );
    expect(lead.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: LEAD_ID,
        $or: [{ propertyId: { $in: [makeObjectId("prop")] } }],
      },
      expect.objectContaining({
        status: "converted",
        convertedAt: expect.any(Date),
        convertedTenantId: String(createdTenant._id),
      }),
      { new: true },
    );
    const body = await json(res);
    expect(body.convertedTenantId).toBe(String(createdTenant._id));
  });

  it("admin advances lead when scope covers the property", async () => {
    const PROP_ID = makeObjectId("property");
    const SCOPED_ADMIN_ID = makeObjectId("scoped-admin");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: SCOPED_ADMIN_ID, role: "admin" })));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: SCOPED_ADMIN_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: PROP_ID,
          permissions: ["lead:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const propLead = makeLead({
      _id: LEAD_ID,
      propertyId: PROP_ID,
      ownerId: OWNER_ID,
      status: "new",
    });
    const updated = makeLead({
      _id: LEAD_ID,
      propertyId: PROP_ID,
      ownerId: OWNER_ID,
      status: "contacted",
    });
    lead.findOne.mockReturnValue(buildQuery(propLead));
    lead.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest("/api/v1/leads/x", {
        method: "PATCH",
        body: { status: "contacted" },
        token: signToken(SCOPED_ADMIN_ID),
      }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(200);
    expect(lead.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: LEAD_ID,
        $or: [{ propertyId: { $in: [PROP_ID] } }],
      },
      { status: "contacted" },
      { new: true },
    );
  });
});
