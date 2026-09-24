/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeLease, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));

import { DELETE, GET, PATCH } from "@/app/api/v1/leases/[id]/route";

const { user, lease: leaseStub, invoice: invoiceStub } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const LEASE_ID = makeObjectId("lease");
const INVALID_ID = "not-an-objectid";

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerDoc() {
  return makeUser({ _id: CARETAKER_ID, role: "caretaker", managedByOwnerId: OWNER_ID });
}

function inScopeLease() {
  return makeLease({ _id: LEASE_ID, ownerId: OWNER_ID, status: "active" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/leases/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid id", async () => {
    const res = await GET(buildRequest(`/api/v1/leases/${INVALID_ID}`), withParams(INVALID_ID));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid lease id");
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest(`/api/v1/leases/${LEASE_ID}`), withParams(LEASE_ID));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    const res = await GET(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, { token: signToken(CARETAKER_ID) }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("404 when absent", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, { token: signToken(OWNER_ID) }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("404 for another owner's lease (existence hidden)", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(
      buildQuery(makeLease({ _id: LEASE_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await GET(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, { token: signToken(OWNER_ID) }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("200 for an in-scope lease", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    const res = await GET(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, { token: signToken(OWNER_ID) }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as { ownerId?: string }).ownerId).toBe(OWNER_ID);
  });
});

describe("PATCH /api/v1/leases/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for a mismatched origin", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        headers: { origin: "http://evil.example" },
        body: { rentAmount: 30000 },
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid id", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/leases/${INVALID_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { rentAmount: 30000 },
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 when absent", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(null));
    const res = await PATCH(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { rentAmount: 30000 },
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("403 for another owner's lease", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(
      buildQuery(makeLease({ _id: LEASE_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await PATCH(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { rentAmount: 30000 },
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(403);
    expect(leaseStub.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("400 for an invalid payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    const res = await PATCH(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { rentAmount: -5 },
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid lease payload");
  });

  it("strips identity fields and persists only editable ones", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    const updated = { ...inScopeLease(), rentAmount: 30000 };
    leaseStub.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: {
          rentAmount: 30000,
          tenantId: makeObjectId("spoof"),
          propertyId: makeObjectId("spoof"),
          ownerId: OTHER_OWNER_ID,
          frequency: "monthly",
        },
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(200);
    const updateData = leaseStub.findOneAndUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(updateData.rentAmount).toBe(30000);
    expect(updateData.tenantId).toBeUndefined();
    expect(updateData.propertyId).toBeUndefined();
    expect(updateData.ownerId).toBeUndefined();
    expect(updateData.frequency).toBeUndefined();
    const body = await json(res);
    expect((body.data as { rentAmount?: number }).rentAmount).toBe(30000);
  });

  it("auto-stamps endDate when an active lease is ended without one", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease())); // active, endDate null
    leaseStub.findOneAndUpdate.mockReturnValue(buildQuery({ ...inScopeLease(), status: "ended" }));

    const res = await PATCH(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "ended" },
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(200);
    const [filter, updateData] = leaseStub.findOneAndUpdate.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ _id: LEASE_ID });
    expect(updateData.status).toBe("ended");
    expect(updateData.endDate).toBeInstanceOf(Date);
  });

  it("does not stamp endDate when one is provided in the payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    const providedEnd = new Date("2026-11-30T00:00:00.000Z");
    leaseStub.findOneAndUpdate.mockReturnValue(
      buildQuery({ ...inScopeLease(), status: "ended", endDate: providedEnd }),
    );

    const res = await PATCH(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { endDate: providedEnd },
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(200);
    const updateData = leaseStub.findOneAndUpdate.mock.calls[0][1] as {
      status?: string;
      endDate?: Date;
    };
    expect(updateData.endDate).toBeInstanceOf(Date);
    expect((updateData.endDate as Date).toISOString()).toBe(providedEnd.toISOString());
  });
});

describe("DELETE /api/v1/leases/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("409 when invoices reference the lease", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    invoiceStub.exists.mockResolvedValue({ _id: makeObjectId("inv") });

    const res = await DELETE(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Lease is referenced by invoices and cannot be deleted");
    expect(invoiceStub.exists).toHaveBeenCalledWith({ leaseId: LEASE_ID });
    expect(leaseStub.deleteOne).not.toHaveBeenCalled();
  });

  it("200 and deletes when no invoices reference the lease", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(buildQuery(inScopeLease()));
    invoiceStub.exists.mockResolvedValue(null);
    leaseStub.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await DELETE(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(200);
    expect(leaseStub.deleteOne).toHaveBeenCalledWith({ _id: LEASE_ID });
    const body = await json(res);
    expect(body.message).toBe("Lease deleted");
  });

  it("403 for a cross-owner delete before any invoice check", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    leaseStub.findById.mockReturnValue(
      buildQuery(makeLease({ _id: LEASE_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await DELETE(
      buildRequest(`/api/v1/leases/${LEASE_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(LEASE_ID),
    );
    expect(res.status).toBe(403);
    expect(invoiceStub.exists).not.toHaveBeenCalled();
  });
});
