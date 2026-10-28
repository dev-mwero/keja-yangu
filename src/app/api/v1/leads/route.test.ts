/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeLead, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Lead", () => ({ Lead: getModelStubs().lead }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));

import { GET, POST } from "@/app/api/v1/leads/route";

const { user, lead } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const ADMIN_ID = makeObjectId("admin");
const CARETAKER_ID = makeObjectId("caretaker");
const TENANT_ID = makeObjectId("tenant");

const validLeadBody = {
  name: "John Doe",
  phone: "+254712345678",
  email: "john@example.com",
};

const createdLead = makeLead({ _id: makeObjectId("l1"), ownerId: OWNER_ID });

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/leads", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/leads"));
    expect(res.status).toBe(401);
  });

  it("403 for a tenant actor", async () => {
    const tenant = makeUser({ _id: TENANT_ID, role: "tenant" });
    user.findById.mockReturnValue(buildQuery(tenant));
    const res = await GET(buildRequest("/api/v1/leads", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(403);
  });

  it("403 for a caretaker without lead permissions", async () => {
    const caretaker = makeUser({
      _id: CARETAKER_ID,
      role: "caretaker",
      managedByOwnerId: OWNER_ID,
      privileges: [],
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    const res = await GET(buildRequest("/api/v1/leads", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(403);
  });

  it("returns an owner's leads, newest first", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(owner));
    const docs = [makeLead({ _id: makeObjectId("l1") })];
    const chain = buildQuery(docs);
    lead.find.mockReturnValue(chain);
    lead.countDocuments.mockResolvedValue(1);

    const res = await GET(buildRequest("/api/v1/leads", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(lead.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(lead.countDocuments).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    const body = await json(res);
    expect(body.data).toHaveLength(1);
  });

  it("scopes a custodian to the managing owner's leads", async () => {
    const custodian = makeUser({
      _id: CUSTODIAN_ID,
      role: "custodian",
      managedByOwnerId: OWNER_ID,
    });
    user.findById.mockReturnValue(buildQuery(custodian));
    lead.find.mockReturnValue(buildQuery([]));
    lead.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/leads", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(200);
    expect(lead.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("403 for an orphaned custodian", async () => {
    const custodian = makeUser({
      _id: CUSTODIAN_ID,
      role: "custodian",
      managedByOwnerId: "",
    });
    user.findById.mockReturnValue(buildQuery(custodian));
    const res = await GET(buildRequest("/api/v1/leads", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(403);
  });

  it("lets a system-admin see all leads without an owner filter", async () => {
    const admin = makeUser({ _id: ADMIN_ID, role: "system-admin" });
    user.findById.mockReturnValue(buildQuery(admin));
    lead.find.mockReturnValue(buildQuery([]));
    lead.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/leads", { token: signToken(ADMIN_ID) }));
    expect(res.status).toBe(200);
    expect(lead.find).toHaveBeenCalledWith({});
  });

  it("applies a status filter", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(owner));
    lead.find.mockReturnValue(buildQuery([]));
    lead.countDocuments.mockResolvedValue(0);

    await GET(
      buildRequest("/api/v1/leads?status=contacted", {
        token: signToken(OWNER_ID),
      }),
    );
    expect(lead.find).toHaveBeenCalledWith({ ownerId: OWNER_ID, status: "contacted" });
  });
});

describe("POST /api/v1/leads", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/leads", { method: "POST", body: validLeadBody }));
    expect(res.status).toBe(401);
  });

  it("403 for a tenant actor", async () => {
    const tenant = makeUser({ _id: TENANT_ID, role: "tenant" });
    user.findById.mockReturnValue(buildQuery(tenant));
    const res = await POST(
      buildRequest("/api/v1/leads", {
        method: "POST",
        body: validLeadBody,
        token: signToken(TENANT_ID),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a caretaker without manage_tenants", async () => {
    const caretaker = makeUser({
      _id: CARETAKER_ID,
      role: "caretaker",
      managedByOwnerId: OWNER_ID,
      privileges: [],
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    const res = await POST(
      buildRequest("/api/v1/leads", {
        method: "POST",
        body: validLeadBody,
        token: signToken(CARETAKER_ID),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid payload", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(owner));
    const res = await POST(
      buildRequest("/api/v1/leads", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "   ", phone: "   " },
      }),
    );
    expect(res.status).toBe(400);
    expect(lead.create).not.toHaveBeenCalled();
  });

  it("owner create attributes ownerId and createdBy to the actor", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(owner));
    lead.create.mockResolvedValue(createdLead);

    const res = await POST(
      buildRequest("/api/v1/leads", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: validLeadBody,
      }),
    );
    expect(res.status).toBe(201);
    expect(lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        createdBy: OWNER_ID,
        name: "John Doe",
        phone: "+254712345678",
        email: "john@example.com",
        status: "new",
      }),
    );
    const body = await json(res);
    expect(body.data).toEqual(createdLead);
  });

  it("caretaker with manage_tenants can create a lead in the managing owner's portfolio", async () => {
    const caretaker = makeUser({
      _id: CARETAKER_ID,
      role: "caretaker",
      managedByOwnerId: OWNER_ID,
      privileges: ["manage_tenants"],
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    lead.create.mockResolvedValue(createdLead);

    const res = await POST(
      buildRequest("/api/v1/leads", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: validLeadBody,
      }),
    );
    expect(res.status).toBe(201);
    expect(lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: OWNER_ID, createdBy: CARETAKER_ID }),
    );
  });
});
