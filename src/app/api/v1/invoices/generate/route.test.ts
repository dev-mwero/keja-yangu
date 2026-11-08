/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatInvoiceNumber } from "@/lib/invoice-numbering";
import { currentPeriod } from "@/lib/invoicing";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { activeAssignment } from "@/test/utils/assignment-mocks";
import { makeLease, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  notifyLeaseExpiry: vi.fn().mockResolvedValue(true),
  DAY_IN_MS: 86_400_000,
}));
vi.mock("@/models/User", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { User: get().user };
});
vi.mock("@/models/Property", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Property: get().property };
});
vi.mock("@/models/Lease", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Lease: get().lease };
});
vi.mock("@/models/Invoice", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Invoice: get().invoice };
});
vi.mock("@/models/Tenant", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Tenant: get().tenant };
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

import { POST } from "@/app/api/v1/invoices/generate/route";
import { notifyLeaseExpiry } from "@/lib/notifications";

const {
  user,
  lease: leaseStub,
  invoice: invoiceStub,
  tenant: tenantStub,
  managementAssignment,
  unit: unitStub,
  billingAccount: billingAccountStub,
  unitBillingAssignment: unitBillingAssignmentStub,
} = getModelStubs();
const notifyLeaseExpiryMock = vi.mocked(notifyLeaseExpiry);

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const ADMIN_ID = makeObjectId("admin");
const PROPERTY_ID = makeObjectId("p1");
const LEASE_A = makeObjectId("lease-a");
const LEASE_B = makeObjectId("lease-b");

function ownerDoc() {
  const doc = makeUser({ _id: OWNER_ID, role: "admin" });
  managementAssignment.find.mockReturnValue(
    buildQuery([
      activeAssignment({
        principalUserId: OWNER_ID,
        accessRole: "admin",
        propertyId: PROPERTY_ID,
        permissions: ["invoice:generate"],
      }),
    ]),
  );
  return doc;
}

function caretakerDoc() {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    privileges: ["manage_invoices"],
  });
}

function activeLeases() {
  return [
    makeLease({ _id: LEASE_A, ownerId: OWNER_ID, propertyId: PROPERTY_ID }),
    makeLease({ _id: LEASE_B, ownerId: OWNER_ID, propertyId: PROPERTY_ID, rentAmount: 18000 }),
  ];
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/v1/invoices/generate", () => {
  beforeEach(() => {
    resetModelStubs();
    notifyLeaseExpiryMock.mockClear();
    tenantStub.find.mockReturnValue(buildQuery([]));
    billingAccountStub.find.mockReturnValue(buildQuery([]));
    unitStub.find.mockReturnValue(buildQuery([]));
    unitBillingAssignmentStub.find.mockReturnValue(buildQuery([]));
  });

  it("403 for a mismatched origin", async () => {
    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { origin: "http://evil.example" },
        body: {},
      }),
    );
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/invoices/generate", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker without manage_invoices", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CARETAKER_ID,
          role: "caretaker",
          privileges: [],
        }),
      ),
    );
    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(403);
    expect(leaseStub.find).not.toHaveBeenCalled();
  });

  it("400 for an invalid generate payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { period: "2026" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid generate payload");
  });

  it("400 for a future period", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { period: "2099-01" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Cannot generate invoices for future periods");
    expect(leaseStub.find).not.toHaveBeenCalled();
  });

  it("creates numbered invoices for every active owner lease in the current period", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery(activeLeases()));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    const period = currentPeriod();
    // One bulk reservation: counter advanced 0 → 2, so the block is [1, 2].
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { [period]: 2 } }));
    invoiceStub.insertMany.mockResolvedValue([{}, {}]);

    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    expect(leaseStub.find).toHaveBeenCalledWith({
      status: "active",
      $or: [{ propertyId: { $in: [PROPERTY_ID] } }],
    });
    expect(invoiceStub.find).toHaveBeenCalledWith({
      leaseId: { $in: [LEASE_A, LEASE_B] },
      period,
    });
    expect(user.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(user.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: OWNER_ID },
      { $inc: { [`invoiceCounters.${period}`]: 2 } },
      { new: true, upsert: false },
    );
    expect(invoiceStub.insertMany).toHaveBeenCalledTimes(1);
    const [drafts, options] = invoiceStub.insertMany.mock.calls[0] as [
      Array<{ invoiceNumber: string; leaseId: string; amountDue: number }>,
      { ordered: boolean },
    ];
    expect(options).toEqual({ ordered: false });
    expect(drafts).toHaveLength(2);
    expect(drafts[0].invoiceNumber).toBe(formatInvoiceNumber(period, 1));
    expect(drafts[1].invoiceNumber).toBe(formatInvoiceNumber(period, 2));
    expect(drafts[0].leaseId).toBe(LEASE_A);
    expect(drafts[1].leaseId).toBe(LEASE_B);
    const body = await json(res);
    expect(body.data).toEqual({ created: 2, skipped: 0 });
  });

  it("fires lease-expiry notifications only for leases ending within 30 days", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const inTenDays = new Date(Date.now() + 10 * 86_400_000);
    const farAway = new Date(Date.now() + 90 * 86_400_000);
    leaseStub.find.mockReturnValue(
      buildQuery([
        makeLease({
          _id: LEASE_A,
          ownerId: OWNER_ID,
          propertyId: PROPERTY_ID,
          endDate: inTenDays,
        }),
        makeLease({
          _id: LEASE_B,
          ownerId: OWNER_ID,
          propertyId: PROPERTY_ID,
          endDate: farAway,
        }),
      ]),
    );
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    const period = currentPeriod();
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { [period]: 2 } }));
    invoiceStub.insertMany.mockResolvedValue([{}, {}]);

    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    expect(notifyLeaseExpiryMock).toHaveBeenCalledTimes(1);
    expect(notifyLeaseExpiryMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: LEASE_A, endDate: inTenDays }),
      expect.any(Number),
    );
  });

  it("skips leases belonging to owning tenants", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const leases = [
      makeLease({ _id: LEASE_A, ownerId: OWNER_ID, propertyId: PROPERTY_ID, tenantId: "owning-t" }),
      makeLease({ _id: LEASE_B, ownerId: OWNER_ID, propertyId: PROPERTY_ID, tenantId: "res-t" }),
    ];
    leaseStub.find.mockReturnValue(buildQuery(leases));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    tenantStub.find.mockReturnValue(
      buildQuery([
        { _id: "owning-t", type: "owning" },
        { _id: "res-t", type: "residential" },
      ]).select("_id type"),
    );
    const period = currentPeriod();
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { [period]: 1 } }));
    invoiceStub.insertMany.mockResolvedValue([{}]);

    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    const body = (await json(res)) as { data: { created: number; skipped: number } };
    expect(body.data.created).toBe(1);
    expect(body.data.skipped).toBe(1);
  });

  it("skips leases that already have an invoice for the period", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery([activeLeases()[0]]));
    invoiceStub.find.mockReturnValue(buildQuery([{ leaseId: LEASE_A }]).select("leaseId"));

    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual({ created: 0, skipped: 1 });
    expect(invoiceStub.insertMany).not.toHaveBeenCalled();
    expect(user.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("full no-op short-circuit: never reserves invoice numbers", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery(activeLeases()));
    invoiceStub.find.mockReturnValue(
      buildQuery([{ leaseId: LEASE_A }, { leaseId: LEASE_B }]).select("leaseId"),
    );

    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual({ created: 0, skipped: 2 });
    expect(invoiceStub.insertMany).not.toHaveBeenCalled();
    expect(user.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("counts an insert-time duplicate as skipped", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery([activeLeases()[0]]));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    const period = currentPeriod();
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { [period]: 1 } }));
    // A concurrent run won the (leaseId, period) unique-index race.
    invoiceStub.insertMany.mockRejectedValue({ writeErrors: [{ code: 11000, index: 0 }] });

    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual({ created: 0, skipped: 1 });
  });

  it("rethrows non-duplicate failures from the bulk insert", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery([activeLeases()[0]]));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    const period = currentPeriod();
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { [period]: 1 } }));
    invoiceStub.insertMany.mockRejectedValue(new Error("db exploded"));

    await expect(
      POST(
        buildRequest("/api/v1/invoices/generate", {
          method: "POST",
          token: signToken(OWNER_ID),
          body: {},
        }),
      ),
    ).rejects.toThrow("db exploded");
  });

  it("scopes a managing caretaker to leases of their assigned properties", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: ["invoice:generate"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    leaseStub.find.mockReturnValue(buildQuery([]));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));

    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    expect(leaseStub.find).toHaveBeenCalledWith({
      status: "active",
      propertyId: { $in: [PROPERTY_ID] },
    });
    const body = await json(res);
    expect(body.data).toEqual({ created: 0, skipped: 0 });
  });

  it("scopes an admin to leases on assigned properties using $or filter", async () => {
    const period = currentPeriod();
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { [period]: 2 } }));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: ADMIN_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: ["invoice:generate"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    leaseStub.find.mockReturnValue(buildQuery(activeLeases()));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    invoiceStub.insertMany.mockResolvedValue([{}, {}]);
    tenantStub.find.mockReturnValue(buildQuery([]));

    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(ADMIN_ID, { role: "admin" }),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    // Lease query should have used $or with propertyId filter
    const leaseFilter = leaseStub.find.mock.calls[0][0] as Record<string, unknown>;
    expect(leaseFilter).toMatchObject({
      $or: [{ propertyId: { $in: [PROPERTY_ID] } }],
    });
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery([]));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    invoiceStub.insertMany.mockResolvedValue([]);
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        buildRequest("/api/v1/invoices/generate", {
          method: "POST",
          token: signToken(OWNER_ID),
          headers: { "x-forwarded-for": "203.0.113.15" },
          body: {},
        }),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
