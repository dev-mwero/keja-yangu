/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeComplaint, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Complaint", () => ({ Complaint: getModelStubs().complaint }));

import { PATCH } from "@/app/api/v1/complaints/[id]/route";

const { user, property, complaint } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const PROPERTY_ID = makeObjectId("p1");
const OTHER_PROPERTY_ID = makeObjectId("p2");
const COMPLAINT_ID = makeObjectId("complaint");
const INVALID_ID = "not-an-objectid";

function ownerUser() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerUser(privileges: string[]) {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: privileges as never,
  });
}

function openComplaint() {
  return makeComplaint({
    _id: COMPLAINT_ID,
    propertyId: PROPERTY_ID,
    ownerId: OWNER_ID,
    status: "open",
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("PATCH /api/v1/complaints/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid complaint id", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${INVALID_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: {},
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    complaint.findById.mockReturnValue(buildQuery(openComplaint()));
    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${COMPLAINT_ID}`, { method: "PATCH", body: {} }),
      withParams(COMPLAINT_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 when the complaint is missing or foreign", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    complaint.findById.mockReturnValue(buildQuery(null));
    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${COMPLAINT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "resolved" },
      }),
      withParams(COMPLAINT_ID),
    );
    expect(res.status).toBe(404);
  });

  it("403 for a foreign owner updating another owner's complaint", async () => {
    const foreignUser = makeUser({ _id: makeObjectId("other-owner"), role: "owner" });
    user.findById.mockReturnValue(buildQuery(foreignUser));
    complaint.findById.mockReturnValue(buildQuery(openComplaint()));
    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${COMPLAINT_ID}`, {
        method: "PATCH",
        token: signToken(foreignUser._id),
        body: { status: "resolved" },
      }),
      withParams(COMPLAINT_ID),
    );
    expect(res.status).toBe(403);
    expect(complaint.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("400 for an invalid payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    complaint.findById.mockReturnValue(buildQuery(openComplaint()));
    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${COMPLAINT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "figuring-it-out" },
      }),
      withParams(COMPLAINT_ID),
    );
    expect(res.status).toBe(400);
  });

  it("owner updates a complaint status with audit stamps", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    complaint.findById.mockReturnValue(buildQuery(openComplaint()));
    const updated = { ...openComplaint(), status: "resolved" };
    complaint.findOneAndUpdate.mockReturnValue(buildQuery(updated));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));

    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${COMPLAINT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "resolved", resolution: "Fixed the tap." },
      }),
      withParams(COMPLAINT_ID),
    );
    expect(res.status).toBe(200);
    const updateData = complaint.findOneAndUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(updateData.status).toBe("resolved");
    expect(updateData.resolution).toBe("Fixed the tap.");
    expect(updateData.updatedById).toBe(OWNER_ID);
    expect(updateData.updatedByRole).toBe("owner");
  });

  it("re-scopes the atomic update with the permission-checked complaint fields", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    const complaintRow = openComplaint();
    const updated = { ...complaintRow, status: "resolved" };
    complaint.findById.mockReturnValue(buildQuery(complaintRow));
    complaint.findOneAndUpdate.mockReturnValue(buildQuery(updated));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));

    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${COMPLAINT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "resolved", resolution: "Fixed the tap." },
      }),
      withParams(COMPLAINT_ID),
    );
    expect(res.status).toBe(200);
    // The same complaint _id, ownerId, propertyId and tenantId used for the
    // permission check must be re-applied atomically so a stale read cannot be
    // upserted onto a different tenant, property or owner.
    expect(complaint.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: COMPLAINT_ID,
        ownerId: complaintRow.ownerId,
        propertyId: complaintRow.propertyId,
        tenantId: complaintRow.tenantId,
      },
      expect.objectContaining({
        status: "resolved",
        updatedById: OWNER_ID,
        updatedByRole: "owner",
      }),
      expect.objectContaining({ new: true }),
    );
  });

  it("an assigned caretaker with manage_complaints updates an in-scope complaint", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser(["manage_complaints"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));
    complaint.findById.mockReturnValue(buildQuery(openComplaint()));
    const updated = { ...openComplaint(), status: "in-progress" };
    complaint.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${COMPLAINT_ID}`, {
        method: "PATCH",
        token: signToken(CARETAKER_ID),
        body: { status: "in-progress" },
      }),
      withParams(COMPLAINT_ID),
    );
    expect(res.status).toBe(200);
    const updateData = complaint.findOneAndUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(updateData.updatedBy).toBeUndefined();
    expect(updateData.updatedById).toBe(CARETAKER_ID);
    expect(updateData.updatedByRole).toBe("caretaker");
  });

  it("403 when a caretaker lacks manage_complaints", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser([])));
    complaint.findById.mockReturnValue(buildQuery(openComplaint()));
    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${COMPLAINT_ID}`, {
        method: "PATCH",
        token: signToken(CARETAKER_ID),
        body: { status: "resolved" },
      }),
      withParams(COMPLAINT_ID),
    );
    expect(res.status).toBe(403);
    expect(complaint.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("403 when a caretaker updates a complaint outside their assigned properties", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser(["manage_complaints"])));
    property.find.mockReturnValue(buildQuery([{ _id: OTHER_PROPERTY_ID }]));
    complaint.findById.mockReturnValue(buildQuery(openComplaint())); // complaint on PROPERTY_ID
    const res = await PATCH(
      buildRequest(`/api/v1/complaints/${COMPLAINT_ID}`, {
        method: "PATCH",
        token: signToken(CARETAKER_ID),
        body: { status: "resolved" },
      }),
      withParams(COMPLAINT_ID),
    );
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Forbidden");
    expect(complaint.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
