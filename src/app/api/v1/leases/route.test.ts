/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import {
  makeLease,
  makeObjectId,
  makeProperty,
  makeTenant,
  makeUser,
} from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));

import { GET, POST } from "@/app/api/v1/leases/route";

const { user, property, tenant: tenantStub, lease: leaseStub } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const ADMIN_ID = makeObjectId("admin");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const OTHER_PROPERTY_ID = makeObjectId("p2");

const LEASE_INPUT = {
  tenantId: TENANT_ID,
  propertyId: PROPERTY_ID,
  rentAmount: 25000,
  frequency: "monthly" as const,
  startDate: new Date("2026-09-01T00:00:00.000Z"),
};

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerDoc() {
  return makeUser({ _id: CARETAKER_ID, role: "caretaker", managedByOwnerId: OWNER_ID });
}

function adminDoc() {
  return makeUser({ _id: ADMIN_ID, role: "system-admin" });
}

function inScopeLease() {
  return makeLease({
    tenantId: TENANT_ID,
    propertyId: PROPERTY_ID,
    ownerId: OWNER_ID,
    status: "active",
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/leases", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/leases"));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker — leases are owner/admin-only", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    const res = await GET(buildRequest("/api/v1/leases", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(403);
    expect(leaseStub.find).not.toHaveBeenCalled();
  });

  it("200 for an owner scoped to their own leases with pagination", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const leases = [inScopeLease(), makeLease({ _id: makeObjectId("l2"), status: "ended" })];
    leaseStub.find.mockReturnValue(buildQuery(leases).sort({ createdAt: -1 }).skip(0).limit(10));
    leaseStub.countDocuments.mockResolvedValue(2);

    const res = await GET(buildRequest("/api/v1/leases", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(leaseStub.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    const body = await json(res);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it("appends status, tenantId and propertyId filters when present", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(10));
    leaseStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/leases?status=ended&tenantId=t&propertyId=p", {
        token: signToken(OWNER_ID),
      }),
    );
    expect(res.status).toBe(200);
    expect(leaseStub.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      status: "ended",
      tenantId: "t",
      propertyId: "p",
    });
  });

  it("200 for a system-admin with an unscoped filter", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    leaseStub.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(10));
    leaseStub.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/leases", { token: signToken(ADMIN_ID) }));
    expect(res.status).toBe(200);
    expect(leaseStub.find).toHaveBeenCalledWith({});
  });

  it("reads through select with lease-safe fields and a createdAt sort", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const chain = buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(10);
    leaseStub.find.mockReturnValue(chain);
    leaseStub.countDocuments.mockResolvedValue(0);

    await GET(buildRequest("/api/v1/leases", { token: signToken(OWNER_ID) }));
    expect(leaseStub.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(chain.select).toHaveBeenCalledWith(
      "tenantId propertyId ownerId rentAmount frequency startDate endDate status notes createdAt updatedAt",
    );
  });
});

describe("POST /api/v1/leases", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for a request with a mismatched origin", async () => {
    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { origin: "http://evil.example" },
        body: LEASE_INPUT,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/leases", { method: "POST", body: LEASE_INPUT }));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: LEASE_INPUT,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a tenant user", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: makeObjectId("t"), role: "tenant" })));
    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(makeObjectId("t")),
        body: LEASE_INPUT,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid lease payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { ...LEASE_INPUT, rentAmount: "expensive" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid lease payload");
  });

  it("404 when the property does not exist", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: LEASE_INPUT,
      }),
    );
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("Property not found");
  });

  it("403 when the owner creates a lease on another owner's property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: OTHER_PROPERTY_ID, ownerId: makeObjectId("foreign") })),
    );
    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { ...LEASE_INPUT, propertyId: OTHER_PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 when the tenant is not found or not active", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    tenantStub.findById.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: LEASE_INPUT,
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Tenant not found or not active");
  });

  it("400 when the tenant belongs to a different property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    tenantStub.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, ownerId: OWNER_ID, propertyId: OTHER_PROPERTY_ID })),
    );
    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: LEASE_INPUT,
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Tenant is not attached to the specified property");
  });

  it("409 when the tenant already has an active lease", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    tenantStub.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, ownerId: OWNER_ID, propertyId: PROPERTY_ID })),
    );
    leaseStub.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("existing") }));
    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: LEASE_INPUT,
      }),
    );
    expect(res.status).toBe(409);
    expect(leaseStub.findOne).toHaveBeenCalledWith({ tenantId: TENANT_ID, status: "active" });
    const body = await json(res);
    expect(body.error).toBe("Tenant already has an active lease");
  });

  it("201 creates the lease with the ownerId derived from the property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    tenantStub.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, ownerId: OWNER_ID, propertyId: PROPERTY_ID })),
    );
    leaseStub.findOne.mockReturnValue(buildQuery(null));
    leaseStub.create.mockResolvedValue({ _id: makeObjectId("new-lease") });
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));

    const res = await POST(
      buildRequest("/api/v1/leases", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: LEASE_INPUT,
      }),
    );
    expect(res.status).toBe(201);
    expect(property.find).not.toHaveBeenCalled();
    expect(leaseStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        ownerId: OWNER_ID,
        rentAmount: 25000,
        frequency: "monthly",
      }),
    );
    const body = await json(res);
    expect((body.data as { ownerId?: string }).ownerId).toBe(OWNER_ID);
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(null)); // 404 path — cheap, no create
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        buildRequest("/api/v1/leases", {
          method: "POST",
          token: signToken(OWNER_ID),
          headers: { "x-forwarded-for": "203.0.113.11" },
          body: LEASE_INPUT,
        }),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
