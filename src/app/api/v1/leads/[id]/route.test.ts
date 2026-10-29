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

import { GET, PATCH } from "@/app/api/v1/leads/[id]/route";

const { user, lead, tenant } = getModelStubs();

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
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(owner));
    lead.findOne.mockReturnValue(buildQuery(existingLead));

    const res = await GET(
      buildRequest("/api/v1/leads/x", { token: signToken(OWNER_ID) }),
      withParams(LEAD_ID),
    );
    expect(res.status).toBe(200);
    expect(lead.findOne).toHaveBeenCalledWith({ _id: LEAD_ID, ownerId: OWNER_ID });
    const body = await json(res);
    expect(body.data as Record<string, unknown>).toEqual(existingLead);
  });

  it("404 when the lead is not in the actor's portfolio", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
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
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
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
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
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
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
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
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
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
      { _id: LEAD_ID, ownerId: OWNER_ID },
      { status: "contacted" },
      { new: true },
    );
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("contacted");
  });

  it("converts an approved lead and creates a Tenant row", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
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
      { _id: LEAD_ID, ownerId: OWNER_ID },
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
});
