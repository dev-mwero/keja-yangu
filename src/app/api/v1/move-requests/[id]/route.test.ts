/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/MoveRequest", () => ({ MoveRequest: getModelStubs().moverrequest }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/lib/notifications", () => ({
  notifyMoveRequestDecided: vi.fn().mockResolvedValue(true),
}));

import { PATCH } from "@/app/api/v1/move-requests/[id]/route";
import { notifyMoveRequestDecided } from "@/lib/notifications";

const { user, moverrequest, unit, lease, tenant, property } = getModelStubs();
const notifyMoveRequestDecidedMock = vi.mocked(notifyMoveRequestDecided);

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const TENANT_ID = makeObjectId("tenant");
const TENANT_DOC_ID = makeObjectId("tenantdoc");
const PROP_ID = makeObjectId("prop");
const UNIT_ID = makeObjectId("unit");
const MR_ID = makeObjectId("mr");

function moveRequest(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: MR_ID,
    type: "move-out",
    propertyId: PROP_ID,
    ownerId: OWNER_ID,
    blockId: "",
    unitId: UNIT_ID,
    tenantId: TENANT_DOC_ID,
    requestedById: TENANT_ID,
    requestedByRole: "tenant",
    status: "pending",
    decidedById: "",
    decisionNote: "",
    save: vi.fn<() => Promise<unknown>>(),
    toObject: vi.fn<() => unknown>(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  doc.toObject.mockReturnValue(doc);
  return doc;
}

// unitDoc helper no longer used with allocation-based logic.

function authOwner() {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
}

describe("PATCH /api/v1/move-requests/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
    notifyMoveRequestDecidedMock.mockReset().mockResolvedValue(true);
  });

  it("404 when the request does not exist", async () => {
    authOwner();
    moverrequest.findById.mockResolvedValue(null);
    const res = await PATCH(
      buildRequest(`/api/v1/move-requests/${MR_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(MR_ID),
    );
    expect(res.status).toBe(404);
    expect(notifyMoveRequestDecidedMock).not.toHaveBeenCalled();
  });

  it("400 for an invalid decision payload", async () => {
    authOwner();
    moverrequest.findById.mockResolvedValue(moveRequest());
    const res = await PATCH(
      buildRequest(`/api/v1/move-requests/${MR_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "maybe" },
      }),
      withParams(MR_ID),
    );
    expect(res.status).toBe(400);
    expect(notifyMoveRequestDecidedMock).not.toHaveBeenCalled();
  });

  it("403 when a custodian decides a foreign owner's request", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OTHER_OWNER_ID }),
      ),
    );
    moverrequest.findById.mockResolvedValue(moveRequest());
    const res = await PATCH(
      buildRequest(`/api/v1/move-requests/${MR_ID}`, {
        method: "PATCH",
        token: signToken(CUSTODIAN_ID),
        body: { status: "approved" },
      }),
      withParams(MR_ID),
    );
    expect(res.status).toBe(403);
    expect(notifyMoveRequestDecidedMock).not.toHaveBeenCalled();
  });

  it("approving a move-out frees the unit and ends the active lease", async () => {
    authOwner();
    const mr = moveRequest({ type: "move-out" });
    moverrequest.findById.mockResolvedValue(mr);
    tenant.findById.mockReturnValue(
      buildQuery({
        _id: TENANT_DOC_ID,
        userId: TENANT_ID,
        propertyId: PROP_ID,
        ownerId: OWNER_ID,
        status: "active",
      }),
    );
    unit.findOne.mockResolvedValue({ _id: UNIT_ID, propertyId: PROP_ID, status: "occupied" });
    unit.updateOne.mockResolvedValue({ modifiedCount: 1 });
    lease.updateMany.mockResolvedValue({ modifiedCount: 1 });
    tenant.findById.mockReturnValue(
      buildQuery({
        _id: TENANT_DOC_ID,
        userId: TENANT_ID,
        propertyId: PROP_ID,
        ownerId: OWNER_ID,
        status: "active",
      }),
    );

    const res = await PATCH(
      buildRequest(`/api/v1/move-requests/${MR_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved", decisionNote: "Confirmed" },
      }),
      withParams(MR_ID),
    );

    expect(res.status).toBe(200);
    expect(mr.status).toBe("approved");
    expect(mr.decidedById).toBe(OWNER_ID);
    expect(unit.updateOne).toHaveBeenCalled();
    expect(lease.updateMany).toHaveBeenCalledWith(
      { tenantId: TENANT_DOC_ID, status: "active" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "ended" }) }),
    );
    expect(notifyMoveRequestDecidedMock).toHaveBeenCalledTimes(1);
    expect(notifyMoveRequestDecidedMock).toHaveBeenCalledWith(mr);
  });

  it("approving a move-in occupies the unit, activates the tenant, and opens a lease", async () => {
    authOwner();
    const mr = moveRequest({ type: "move-in" });
    moverrequest.findById.mockResolvedValue(mr);
    tenant.findById.mockReturnValue(
      buildQuery({
        _id: TENANT_DOC_ID,
        userId: TENANT_ID,
        propertyId: PROP_ID,
        ownerId: OWNER_ID,
        status: "active",
      }),
    );
    unit.findById.mockReturnValue(buildQuery({ _id: UNIT_ID, propertyId: PROP_ID, rent: 30000 }));
    unit.findOneAndUpdate.mockReturnValue(
      buildQuery({ _id: UNIT_ID, propertyId: PROP_ID, status: "occupied", tenantId: TENANT_ID }),
    );
    unit.updateMany.mockResolvedValue({ modifiedCount: 0 });
    tenant.updateOne.mockResolvedValue({ modifiedCount: 1 });
    tenant.findById.mockReturnValue(
      buildQuery({
        _id: TENANT_DOC_ID,
        userId: TENANT_ID,
        propertyId: PROP_ID,
        ownerId: OWNER_ID,
        status: "active",
      }),
    );
    property.findById.mockReturnValue(buildQuery({ price: 45000 }));
    lease.findOne.mockReturnValue(buildQuery(null));
    lease.create.mockResolvedValue({ _id: makeObjectId("lease") });

    const res = await PATCH(
      buildRequest(`/api/v1/move-requests/${MR_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(MR_ID),
    );

    expect(res.status).toBe(200);
    expect(unit.findOneAndUpdate).toHaveBeenCalled();
    expect(tenant.updateOne).toHaveBeenCalledWith(
      { _id: TENANT_DOC_ID },
      expect.objectContaining({ $set: expect.objectContaining({ status: "active" }) }),
    );
    expect(lease.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_DOC_ID,
        ownerId: OWNER_ID,
        rentAmount: 30000,
        unitId: String(UNIT_ID),
      }),
    );
    expect(notifyMoveRequestDecidedMock).toHaveBeenCalledTimes(1);
    expect(notifyMoveRequestDecidedMock).toHaveBeenCalledWith(mr);
  });

  it("does not duplicate a lease when the tenant already has an active one", async () => {
    authOwner();
    const mr = moveRequest({ type: "move-in" });
    moverrequest.findById.mockResolvedValue(mr);
    tenant.findById.mockReturnValue(
      buildQuery({
        _id: TENANT_DOC_ID,
        userId: TENANT_ID,
        propertyId: PROP_ID,
        ownerId: OWNER_ID,
        status: "active",
      }),
    );
    unit.findById.mockReturnValue(buildQuery({ _id: UNIT_ID, propertyId: PROP_ID, rent: 30000 }));
    unit.findOneAndUpdate.mockReturnValue(
      buildQuery({ _id: UNIT_ID, propertyId: PROP_ID, status: "occupied", tenantId: TENANT_ID }),
    );
    unit.updateMany.mockResolvedValue({ modifiedCount: 0 });
    tenant.updateOne.mockResolvedValue({});
    tenant.findById.mockReturnValue(
      buildQuery({
        _id: TENANT_DOC_ID,
        userId: TENANT_ID,
        propertyId: PROP_ID,
        ownerId: OWNER_ID,
        status: "active",
      }),
    );
    property.findById.mockReturnValue(buildQuery({ price: 45000 }));
    lease.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("lease") }));
    lease.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const res = await PATCH(
      buildRequest(`/api/v1/move-requests/${MR_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(MR_ID),
    );
    expect(res.status).toBe(200);
    expect(lease.create).not.toHaveBeenCalled();
    expect(notifyMoveRequestDecidedMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-apply occupancy effects when re-approving", async () => {
    authOwner();
    const mr = moveRequest({ type: "move-out", status: "approved" });
    moverrequest.findById.mockResolvedValue(mr);

    const res = await PATCH(
      buildRequest(`/api/v1/move-requests/${MR_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(MR_ID),
    );
    expect(res.status).toBe(200);
    expect(unit.findById).not.toHaveBeenCalled();
    expect(lease.updateMany).not.toHaveBeenCalled();
    expect(notifyMoveRequestDecidedMock).not.toHaveBeenCalled();
  });
});
