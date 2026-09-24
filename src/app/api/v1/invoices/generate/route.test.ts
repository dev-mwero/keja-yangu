/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatInvoiceNumber } from "@/lib/invoice-numbering";
import { currentPeriod } from "@/lib/invoicing";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeLease, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
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

import { POST } from "@/app/api/v1/invoices/generate/route";

const { user, property, lease: leaseStub, invoice: invoiceStub } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const MANAGED_OWNER_ID = makeObjectId("managed-owner");
const PROPERTY_ID = makeObjectId("p1");
const LEASE_A = makeObjectId("lease-a");
const LEASE_B = makeObjectId("lease-b");

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerDoc() {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: MANAGED_OWNER_ID,
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
          managedByOwnerId: MANAGED_OWNER_ID,
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
    user.findOneAndUpdate
      .mockReturnValueOnce(buildQuery({ invoiceCounters: { [period]: 1 } }))
      .mockReturnValueOnce(buildQuery({ invoiceCounters: { [period]: 2 } }));
    invoiceStub.create.mockResolvedValue({});

    const res = await POST(
      buildRequest("/api/v1/invoices/generate", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    expect(leaseStub.find).toHaveBeenCalledWith({ status: "active", ownerId: OWNER_ID });
    expect(invoiceStub.find).toHaveBeenCalledWith({
      leaseId: { $in: [LEASE_A, LEASE_B] },
      period,
    });
    expect(user.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { _id: OWNER_ID },
      { $inc: { [`invoiceCounters.${period}`]: 1 } },
      { new: true, upsert: false },
    );
    const firstCreate = invoiceStub.create.mock.calls[0][0] as {
      invoiceNumber: string;
      leaseId: string;
      amountDue: number;
    };
    const secondCreate = invoiceStub.create.mock.calls[1][0] as {
      invoiceNumber: string;
      leaseId: string;
      amountDue: number;
    };
    expect(firstCreate.invoiceNumber).toBe(formatInvoiceNumber(period, 1));
    expect(secondCreate.invoiceNumber).toBe(formatInvoiceNumber(period, 2));
    expect(firstCreate.leaseId).toBe(LEASE_A);
    expect(secondCreate.leaseId).toBe(LEASE_B);
    const body = await json(res);
    expect(body.data).toEqual({ created: 2, skipped: 0 });
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
    expect(invoiceStub.create).not.toHaveBeenCalled();
    expect(user.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("counts an insert-time duplicate as skipped", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery([activeLeases()[0]]));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    const period = currentPeriod();
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { [period]: 1 } }));
    invoiceStub.create.mockRejectedValue({ code: 11000 });

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

  it("rethrows non-duplicate failures from create", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery([activeLeases()[0]]));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    const period = currentPeriod();
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { [period]: 1 } }));
    invoiceStub.create.mockRejectedValue(new Error("db exploded"));

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
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
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
      ownerId: MANAGED_OWNER_ID,
    });
    const body = await json(res);
    expect(body.data).toEqual({ created: 0, skipped: 0 });
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.find.mockReturnValue(buildQuery([]));
    invoiceStub.find.mockReturnValue(buildQuery([]).select("leaseId"));
    invoiceStub.create.mockResolvedValue({});
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
