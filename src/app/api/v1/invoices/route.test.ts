/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatInvoiceNumber } from "@/lib/invoice-numbering";
import { computeDueDate, currentPeriod, deriveStatus } from "@/lib/invoicing";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeInvoice, makeLease, makeObjectId, makeTenant, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  notifyOverdueInvoices: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/models/User", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { User: get().user };
});
vi.mock("@/models/Property", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Property: get().property };
});
vi.mock("@/models/Tenant", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Tenant: get().tenant };
});
vi.mock("@/models/Lease", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Lease: get().lease };
});
vi.mock("@/models/Invoice", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Invoice: get().invoice };
});
vi.mock("@/models/ManagementAssignment", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { ManagementAssignment: get().managementAssignment };
});
vi.mock("@/models/Unit", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Unit: get().unit };
});
vi.mock("@/models/BillingAccount", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { BillingAccount: get().billingAccount };
});
vi.mock("@/models/UnitBillingAssignment", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { UnitBillingAssignment: get().unitBillingAssignment };
});

import { GET, POST } from "@/app/api/v1/invoices/route";
import { notifyOverdueInvoices } from "@/lib/notifications";

const {
  user,
  tenant: tenantStub,
  lease: leaseStub,
  invoice: invoiceStub,
  managementAssignment,
  unit: unitStub,
  billingAccount: billingAccountStub,
  unitBillingAssignment: unitBillingAssignmentStub,
} = getModelStubs();
const notifyOverdueInvoicesMock = vi.mocked(notifyOverdueInvoices);

const OWNER_ID = makeObjectId("admin");
const CARETAKER_ID = makeObjectId("caretaker");
const ADMIN_ID = makeObjectId("admin");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const OTHER_PROPERTY_ID = makeObjectId("p2");
const LEASE_ID = makeObjectId("lease");
const UNIT_ID = makeObjectId("unit-scoped");
const OTHER_UNIT_ID = makeObjectId("other-unit");

const ADMIN_ASSIGNMENT = {
  principalUserId: ADMIN_ID,
  accessRole: "admin",
  scopeType: "property",
  propertyId: PROPERTY_ID,
  permissions: ["invoice:read", "invoice:manage"],
  status: "active",
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  endsAt: null,
};

const CARETAKER_ASSIGNMENT = {
  principalUserId: CARETAKER_ID,
  accessRole: "caretaker",
  scopeType: "property",
  propertyId: PROPERTY_ID,
  permissions: ["invoice:read"],
  status: "active",
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  endsAt: null,
};

function scopedAdminDoc() {
  return makeUser({ _id: ADMIN_ID, role: "admin" });
}

function mockScopedAdmin() {
  user.findById.mockReturnValue(buildQuery(scopedAdminDoc()));
  managementAssignment.find.mockReturnValue(buildQuery([ADMIN_ASSIGNMENT]));
}

function mockCaretakerAssignment() {
  managementAssignment.find.mockReturnValue(buildQuery([CARETAKER_ASSIGNMENT]));
}

/**
 * A caretaker whose assignment covers a single unit, so the resolved scope is
 * units + tenants only — the parent property must not widen the filter.
 */
function mockUnitScopedCaretakerAssignment(permissions: string[] = ["invoice:read"]) {
  managementAssignment.find.mockReturnValue(
    buildQuery([
      {
        principalUserId: CARETAKER_ID,
        accessRole: "caretaker",
        scopeType: "unit",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        permissions,
        status: "active",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: null,
      },
    ]),
  );
  unitStub.find.mockReturnValue(buildQuery([{ _id: UNIT_ID, propertyId: PROPERTY_ID }]));
  leaseStub.find.mockReturnValue(buildQuery([{ tenantId: TENANT_ID }]));
}

function adminDoc() {
  return makeUser({ _id: ADMIN_ID, role: "system-admin" });
}

function caretakerDoc(privileges: string[] = ["manage_invoices"]) {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    privileges: privileges as ReturnType<typeof makeUser>["privileges"],
  });
}

function inScopeLease() {
  return makeLease({
    _id: LEASE_ID,
    tenantId: TENANT_ID,
    propertyId: PROPERTY_ID,
    ownerId: OWNER_ID,
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/invoices", () => {
  beforeEach(() => {
    resetModelStubs();
    notifyOverdueInvoicesMock.mockClear();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/invoices"));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker without manage_invoices (C0)", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc([])));
    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(403);
    expect(invoiceStub.find).not.toHaveBeenCalled();
  });

  it("403 for a caretaker with no active assignments", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Forbidden");
    expect(invoiceStub.find).not.toHaveBeenCalled();
  });

  it("scopes an admin to assigned invoices", async () => {
    mockScopedAdmin();
    const invoice = makeInvoice({ _id: makeObjectId("inv"), ownerId: OWNER_ID, status: "paid" });
    invoiceStub.find.mockReturnValue(
      buildQuery([invoice]).sort({ issuedAt: -1 }).skip(0).limit(10),
    );
    invoiceStub.countDocuments.mockResolvedValue(1);

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(ADMIN_ID) }));
    expect(res.status).toBe(200);
    expect(invoiceStub.find).toHaveBeenCalledWith({
      $or: [{ propertyId: { $in: [PROPERTY_ID] } }],
    });
    const body = await json(res);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it("keeps a system-admin unscoped", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(ADMIN_ID) }));
    expect(res.status).toBe(200);
    expect(invoiceStub.find).toHaveBeenCalledWith({});
  });

  it("scopes a managing caretaker to assigned properties of their owner", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    mockCaretakerAssignment();
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    expect(invoiceStub.find).toHaveBeenCalledWith({
      $or: [{ propertyId: { $in: [PROPERTY_ID] } }],
    });
  });

  it("scopes a unit-assigned caretaker by resolved units and tenants, not parent property", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    mockUnitScopedCaretakerAssignment();
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    const filter = invoiceStub.find.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.$or).toEqual([
      { unitId: { $in: [UNIT_ID] } },
      { tenantId: { $in: [TENANT_ID] } },
    ]);
    expect(filter).not.toHaveProperty("propertyId");
    expect(filter).not.toHaveProperty("ownerId");
  });

  it("returns an empty page for a caretaker with no resolved assignment clauses", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    // A block-scoped assignment whose block holds no units resolves to no
    // property (block scopes never grant one), unit or tenant clauses.
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "block",
          propertyId: PROPERTY_ID,
          blockId: makeObjectId("empty-block"),
          permissions: ["invoice:read"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    unitStub.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    expect(invoiceStub.find).not.toHaveBeenCalled();
    const body = await json(res);
    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it("scopes an admin to invoices on assigned properties or units", async () => {
    const SCOPED_ADMIN_ID = makeObjectId("scoped-admin");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: SCOPED_ADMIN_ID, role: "admin" })));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: SCOPED_ADMIN_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: ["invoice:read"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(SCOPED_ADMIN_ID) }));
    expect(res.status).toBe(200);
    expect(invoiceStub.find).toHaveBeenCalledWith({
      $or: [{ propertyId: { $in: [PROPERTY_ID] } }],
    });
  });

  it("scopes an assignment-backed custodian to invoices on assigned properties", async () => {
    const CUSTODIAN_ID = makeObjectId("custodian");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian" })));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CUSTODIAN_ID,
          accessRole: "custodian",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: ["invoice:read"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(200);
    expect(invoiceStub.find).toHaveBeenCalledWith({
      $or: [{ propertyId: { $in: [PROPERTY_ID] } }],
    });
  });

  it("403 when a caretaker filters by a property outside their assignment", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    mockCaretakerAssignment();

    const res = await GET(
      buildRequest(`/api/v1/invoices?propertyId=${OTHER_PROPERTY_ID}`, {
        token: signToken(CARETAKER_ID),
      }),
    );
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Forbidden");
  });

  it("derives the overdue filter as pending-and-dueDate-past and sweeps globally for a system-admin", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/invoices?status=overdue", { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(200);
    const filter = invoiceStub.find.mock.calls[0][0] as {
      status: string;
      dueDate: { $lt: Date };
    };
    expect(filter.status).toBe("pending");
    expect(filter.dueDate.$lt).toBeInstanceOf(Date);
    expect(notifyOverdueInvoicesMock).toHaveBeenCalledTimes(1);
    expect(notifyOverdueInvoicesMock).toHaveBeenCalledWith(expect.any(Date), {});
  });

  it("sweeps a caretaker's assigned-property scope on overdue reads", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    mockCaretakerAssignment();
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/invoices?status=overdue", { token: signToken(CARETAKER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(notifyOverdueInvoicesMock).toHaveBeenCalledWith(expect.any(Date), {
      propertyId: { $in: [PROPERTY_ID] },
    });
  });

  it("sweeps an admin's assigned portfolio instead of the whole platform", async () => {
    mockScopedAdmin();
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/invoices?status=overdue", { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(200);
    expect(notifyOverdueInvoicesMock).toHaveBeenCalledWith(expect.any(Date), {
      $or: [{ propertyId: { $in: [PROPERTY_ID] } }],
    });
  });

  it("gates an admin without assignments before any overdue sweep", async () => {
    user.findById.mockReturnValue(buildQuery(scopedAdminDoc()));
    managementAssignment.find.mockReturnValue(buildQuery([]));

    const res = await GET(
      buildRequest("/api/v1/invoices?status=overdue", { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(403);
    expect(notifyOverdueInvoicesMock).not.toHaveBeenCalled();
  });

  it("appends period, tenantId, propertyId and leaseId filters", async () => {
    mockScopedAdmin();
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest(
        `/api/v1/invoices?period=2026-09&tenantId=t&propertyId=p&leaseId=l&status=pending`,
        { token: signToken(ADMIN_ID) },
      ),
    );
    expect(res.status).toBe(200);
    expect(invoiceStub.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [{ propertyId: { $in: [PROPERTY_ID] } }],
        period: "2026-09",
        tenantId: "t",
        propertyId: "p",
        leaseId: "l",
        status: "pending",
      }),
    );
  });

  it("serializes stored docs with a derived status and overdue flag", async () => {
    mockScopedAdmin();
    const now = new Date();
    const pastDue = makeInvoice({
      _id: makeObjectId("inv"),
      status: "pending",
      dueDate: new Date("2026-01-05T00:00:00.000Z"),
    });
    invoiceStub.find.mockReturnValue(
      buildQuery([pastDue]).sort({ issuedAt: -1 }).skip(0).limit(10),
    );
    invoiceStub.countDocuments.mockResolvedValue(1);

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(ADMIN_ID) }));
    const body = await json(res);
    const serialized = body.data as Array<Record<string, unknown>>;
    expect(serialized[0].status).toBe(deriveStatus(pastDue, now));
    expect(serialized[0].overdue).toBe(true);
    expect(serialized[0]).not.toHaveProperty("_id.label");
  });
});

describe("POST /api/v1/invoices", () => {
  beforeEach(() => {
    resetModelStubs();
    billingAccountStub.find.mockReturnValue(buildQuery([]));
    billingAccountStub.findOne.mockReturnValue(buildQuery(null));
    unitStub.find.mockReturnValue(buildQuery([]));
    unitBillingAssignmentStub.find.mockReturnValue(buildQuery([]));
  });

  it("403 for a mismatched origin", async () => {
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        headers: { origin: "http://evil.example" },
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/invoices", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker with no active assignments", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Forbidden");
    expect(leaseStub.findById).not.toHaveBeenCalled();
    expect(invoiceStub.create).not.toHaveBeenCalled();
  });

  it("400 for an uninspectable payload", async () => {
    mockScopedAdmin();
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { leaseId: "not-an-objectid" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice payload");
  });

  it("400 when a leaseId payload also attempts to spoof derived fields", async () => {
    mockScopedAdmin();
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { leaseId: LEASE_ID, tenantId: TENANT_ID, propertyId: PROPERTY_ID, amountDue: 1 },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice payload");
    expect(leaseStub.findById).not.toHaveBeenCalled();
  });

  it("400 when a manual invoice omits tenantId (schema-level)", async () => {
    mockScopedAdmin();
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { propertyId: PROPERTY_ID, amountDue: 5000 },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice payload");
  });

  it("400 for a manual invoice without amountDue", async () => {
    mockScopedAdmin();
    tenantStub.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, ownerId: OWNER_ID, propertyId: PROPERTY_ID })),
    );
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { tenantId: TENANT_ID, propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("amountDue is required when creating a manual invoice without a lease");
  });

  it("404 when the referenced lease is missing", async () => {
    mockScopedAdmin();
    leaseStub.findById.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("Lease not found");
  });

  it("403 when an owner references another owner's lease", async () => {
    mockScopedAdmin();
    leaseStub.findById.mockReturnValue(
      buildQuery(makeLease({ _id: LEASE_ID, ownerId: makeObjectId("foreign") })),
    );
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Forbidden");
  });

  it("403 when a unit-scoped caretaker creates an invoice for another unit in the parent property", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    mockUnitScopedCaretakerAssignment(["invoice:manage"]);
    leaseStub.findById.mockReturnValue(buildQuery({ ...inScopeLease(), unitId: OTHER_UNIT_ID }));

    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(403);
    expect(invoiceStub.create).not.toHaveBeenCalled();
  });

  it("409 when an invoice already exists for the lease and period", async () => {
    mockScopedAdmin();
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: {} }));
    invoiceStub.create.mockRejectedValue({
      code: 11000,
      keyPattern: { leaseId: 1, period: 1 },
    });

    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Invoice already exists for this lease and period");
  });

  it("201 derives all invoice fields from the lease and numbers per current period", async () => {
    mockScopedAdmin();
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: {} }));
    invoiceStub.create.mockResolvedValue({ _id: makeObjectId("new-inv") });
    const created = makeInvoice({
      _id: makeObjectId("new-inv"),
      invoiceNumber: "INV-000000-0000", // overwritten below by the mocked find of the create
      period: currentPeriod(),
      leaseId: LEASE_ID,
    });
    invoiceStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(201);
    const expectedPeriod = currentPeriod();
    const expectedNumber = formatInvoiceNumber(expectedPeriod, 1);
    expect(user.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: OWNER_ID },
      { $inc: { [`invoiceCounters.${expectedPeriod}`]: 1 } },
      { new: true, upsert: false },
    );
    expect(invoiceStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: expectedNumber,
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        leaseId: LEASE_ID,
        ownerId: OWNER_ID,
        period: expectedPeriod,
        amountDue: 25000,
        amountPaid: 0,
        status: "pending",
        dueDate: computeDueDate(expectedPeriod),
      }),
    );
    const body = await json(res);
    expect((body.data as { invoiceNumber?: string }).invoiceNumber).toBe("INV-000000-0000");
  });

  it("201 manual invoice without a lease", async () => {
    mockScopedAdmin();
    tenantStub.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, ownerId: OWNER_ID, propertyId: PROPERTY_ID })),
    );
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: {} }));
    invoiceStub.create.mockResolvedValue({ _id: makeObjectId("new-inv") });
    const created = makeInvoice({
      _id: makeObjectId("new-inv"),
      leaseId: "",
      status: "draft",
    });
    invoiceStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { tenantId: TENANT_ID, propertyId: PROPERTY_ID, amountDue: 5000, status: "draft" },
      }),
    );
    expect(res.status).toBe(201);
    expect(invoiceStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        leaseId: "",
        ownerId: OWNER_ID,
        amountDue: 5000,
        status: "draft",
      }),
    );
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    mockScopedAdmin();
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: {} }));
    invoiceStub.create.mockRejectedValue({ code: 11000 });
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        buildRequest("/api/v1/invoices", {
          method: "POST",
          token: signToken(ADMIN_ID),
          headers: { "x-forwarded-for": "203.0.113.12" },
          body: { leaseId: LEASE_ID },
        }),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
