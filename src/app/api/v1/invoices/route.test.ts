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

import { GET, POST } from "@/app/api/v1/invoices/route";
import { notifyOverdueInvoices } from "@/lib/notifications";

const {
  user,
  property,
  tenant: tenantStub,
  lease: leaseStub,
  invoice: invoiceStub,
} = getModelStubs();
const notifyOverdueInvoicesMock = vi.mocked(notifyOverdueInvoices);

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const ADMIN_ID = makeObjectId("admin");
const MANAGED_OWNER_ID = makeObjectId("managed-owner");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const OTHER_PROPERTY_ID = makeObjectId("p2");
const LEASE_ID = makeObjectId("lease");

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function adminDoc() {
  return makeUser({ _id: ADMIN_ID, role: "system-admin" });
}

function caretakerDoc(privileges: string[] = ["manage_invoices"]) {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: MANAGED_OWNER_ID,
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

  it("scopes an owner to their own invoices", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const invoice = makeInvoice({ _id: makeObjectId("inv"), ownerId: OWNER_ID, status: "paid" });
    invoiceStub.find.mockReturnValue(
      buildQuery([invoice]).sort({ issuedAt: -1 }).skip(0).limit(10),
    );
    invoiceStub.countDocuments.mockResolvedValue(1);

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(invoiceStub.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
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
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    expect(property.find).toHaveBeenCalledWith({
      caretakerIds: CARETAKER_ID,
      ownerId: MANAGED_OWNER_ID,
    });
    expect(invoiceStub.find).toHaveBeenCalledWith({
      propertyId: { $in: [PROPERTY_ID] },
      ownerId: MANAGED_OWNER_ID,
    });
  });

  it("403 when a caretaker filters by a property outside their assignment", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));

    const res = await GET(
      buildRequest(`/api/v1/invoices?propertyId=${OTHER_PROPERTY_ID}`, {
        token: signToken(CARETAKER_ID),
      }),
    );
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Forbidden");
  });

  it("derives the overdue filter as pending-and-dueDate-past and sweeps the owner scope", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/invoices?status=overdue", { token: signToken(OWNER_ID) }),
    );
    expect(res.status).toBe(200);
    const filter = invoiceStub.find.mock.calls[0][0] as {
      status: string;
      dueDate: { $lt: Date };
    };
    expect(filter.status).toBe("pending");
    expect(filter.dueDate.$lt).toBeInstanceOf(Date);
    expect(notifyOverdueInvoicesMock).toHaveBeenCalledTimes(1);
    expect(notifyOverdueInvoicesMock).toHaveBeenCalledWith(expect.any(Date), { ownerId: OWNER_ID });
  });

  it("sweeps a caretaker's assigned-property scope on overdue reads", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/invoices?status=overdue", { token: signToken(CARETAKER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(notifyOverdueInvoicesMock).toHaveBeenCalledWith(expect.any(Date), {
      propertyId: { $in: [PROPERTY_ID] },
      ownerId: MANAGED_OWNER_ID,
    });
  });

  it("appends period, tenantId, propertyId and leaseId filters", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest(
        `/api/v1/invoices?period=2026-09&tenantId=t&propertyId=p&leaseId=l&status=pending`,
        { token: signToken(OWNER_ID) },
      ),
    );
    expect(res.status).toBe(200);
    expect(invoiceStub.find).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        period: "2026-09",
        tenantId: "t",
        propertyId: "p",
        leaseId: "l",
        status: "pending",
      }),
    );
  });

  it("serializes stored docs with a derived status and overdue flag", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
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

    const res = await GET(buildRequest("/api/v1/invoices", { token: signToken(OWNER_ID) }));
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
  });

  it("403 for a mismatched origin", async () => {
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(OWNER_ID),
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

  it("400 for an uninspectable payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { leaseId: "not-an-objectid" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice payload");
  });

  it("400 when a leaseId payload also attempts to spoof derived fields", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { leaseId: LEASE_ID, tenantId: TENANT_ID, propertyId: PROPERTY_ID, amountDue: 1 },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice payload");
    expect(leaseStub.findById).not.toHaveBeenCalled();
  });

  it("400 when a manual invoice omits tenantId (schema-level)", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { propertyId: PROPERTY_ID, amountDue: 5000 },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice payload");
  });

  it("400 for a manual invoice without amountDue", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, ownerId: OWNER_ID, propertyId: PROPERTY_ID })),
    );
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { tenantId: TENANT_ID, propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("amountDue is required when creating a manual invoice without a lease");
  });

  it("404 when the referenced lease is missing", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("Lease not found");
  });

  it("403 when an owner references another owner's lease", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(
      buildQuery(makeLease({ _id: LEASE_ID, ownerId: makeObjectId("foreign") })),
    );
    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Forbidden");
  });

  it("409 when an invoice already exists for the lease and period", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: {} }));
    invoiceStub.create.mockRejectedValue({ code: 11000 });

    const res = await POST(
      buildRequest("/api/v1/invoices", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { leaseId: LEASE_ID },
      }),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Invoice already exists for this lease and period");
  });

  it("201 derives all invoice fields from the lease and numbers per current period", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
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
        token: signToken(OWNER_ID),
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
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
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
        token: signToken(OWNER_ID),
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
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: {} }));
    invoiceStub.create.mockRejectedValue({ code: 11000 });
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        buildRequest("/api/v1/invoices", {
          method: "POST",
          token: signToken(OWNER_ID),
          headers: { "x-forwarded-for": "203.0.113.12" },
          body: { leaseId: LEASE_ID },
        }),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
