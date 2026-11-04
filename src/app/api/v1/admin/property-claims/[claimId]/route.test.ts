/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/PropertyClaim", () => ({ PropertyClaim: getModelStubs().propertyClaim }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import { PATCH } from "@/app/api/v1/admin/property-claims/[claimId]/route";

const { user, propertyClaim, managementAssignment } = getModelStubs();

const SYSTEM_ADMIN_ID = makeObjectId("sysadmin");
const ADMIN_ID = makeObjectId("admin");
const CLAIM_ID = makeObjectId("claim1");
const PROPERTY_ID = makeObjectId("prop1");
const INVALID_ID = "invalid-id";

describe("/api/v1/admin/property-claims/[claimId]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  describe("PATCH", () => {
    it("returns 400 for an invalid claim id", async () => {
      const res = await PATCH(
        buildRequest(`/api/v1/admin/property-claims/${INVALID_ID}`, {
          method: "PATCH",
          token: signToken(SYSTEM_ADMIN_ID, { role: "system-admin" }),
          body: { decision: "approved" },
        }),
        withParams(INVALID_ID),
      );
      expect(res.status).toBe(400);
    });

    it("returns 401 when unauthenticated", async () => {
      const res = await PATCH(
        buildRequest(`/api/v1/admin/property-claims/${CLAIM_ID}`, {
          method: "PATCH",
          body: { decision: "approved" },
        }),
        withParams(CLAIM_ID),
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-system-admin role", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));

      const res = await PATCH(
        buildRequest(`/api/v1/admin/property-claims/${CLAIM_ID}`, {
          method: "PATCH",
          token: signToken(ADMIN_ID, { role: "admin" }),
          body: { decision: "approved" },
        }),
        withParams(CLAIM_ID),
      );
      expect(res.status).toBe(403);
    });

    it("returns 404 if claim is not found", async () => {
      user.findById.mockReturnValue(
        buildQuery(makeUser({ _id: SYSTEM_ADMIN_ID, role: "system-admin" })),
      );
      propertyClaim.findById.mockResolvedValue(null);

      const res = await PATCH(
        buildRequest(`/api/v1/admin/property-claims/${CLAIM_ID}`, {
          method: "PATCH",
          token: signToken(SYSTEM_ADMIN_ID, { role: "system-admin" }),
          body: { decision: "approved" },
        }),
        withParams(CLAIM_ID),
      );
      expect(res.status).toBe(404);
    });

    it("returns 409 if claim is not in pending status", async () => {
      user.findById.mockReturnValue(
        buildQuery(makeUser({ _id: SYSTEM_ADMIN_ID, role: "system-admin" })),
      );
      propertyClaim.findById.mockResolvedValue({
        _id: CLAIM_ID,
        status: "approved",
      });

      const res = await PATCH(
        buildRequest(`/api/v1/admin/property-claims/${CLAIM_ID}`, {
          method: "PATCH",
          token: signToken(SYSTEM_ADMIN_ID, { role: "system-admin" }),
          body: { decision: "approved" },
        }),
        withParams(CLAIM_ID),
      );
      expect(res.status).toBe(409);
    });

    it("approves claim and creates management assignment for claimant", async () => {
      user.findById.mockReturnValue(
        buildQuery(makeUser({ _id: SYSTEM_ADMIN_ID, role: "system-admin" })),
      );
      const mockClaim = {
        _id: CLAIM_ID,
        propertyId: PROPERTY_ID,
        claimantUserId: ADMIN_ID,
        status: "pending",
        reviewedByUserId: "",
        decisionNote: "",
        save: vi.fn().mockResolvedValue(undefined),
      };
      propertyClaim.findById.mockResolvedValue(mockClaim);

      const res = await PATCH(
        buildRequest(`/api/v1/admin/property-claims/${CLAIM_ID}`, {
          method: "PATCH",
          token: signToken(SYSTEM_ADMIN_ID, { role: "system-admin" }),
          body: { decision: "approved", decisionNote: "Verified title deed" },
        }),
        withParams(CLAIM_ID),
      );

      expect(res.status).toBe(200);
      expect(mockClaim.status).toBe("approved");
      expect(mockClaim.reviewedByUserId).toBe(SYSTEM_ADMIN_ID);
      expect(mockClaim.decisionNote).toBe("Verified title deed");
      expect(mockClaim.save).toHaveBeenCalled();
      expect(managementAssignment.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          principalUserId: ADMIN_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: PROPERTY_ID,
        }),
        expect.any(Object),
        { upsert: true, new: true },
      );
    });

    it("rejects claim without creating management assignment", async () => {
      user.findById.mockReturnValue(
        buildQuery(makeUser({ _id: SYSTEM_ADMIN_ID, role: "system-admin" })),
      );
      const mockClaim = {
        _id: CLAIM_ID,
        propertyId: PROPERTY_ID,
        claimantUserId: ADMIN_ID,
        status: "pending",
        save: vi.fn().mockResolvedValue(undefined),
      };
      propertyClaim.findById.mockResolvedValue(mockClaim);

      const res = await PATCH(
        buildRequest(`/api/v1/admin/property-claims/${CLAIM_ID}`, {
          method: "PATCH",
          token: signToken(SYSTEM_ADMIN_ID, { role: "system-admin" }),
          body: { decision: "rejected", decisionNote: "Insufficient evidence" },
        }),
        withParams(CLAIM_ID),
      );

      expect(res.status).toBe(200);
      expect(mockClaim.status).toBe("rejected");
      expect(mockClaim.save).toHaveBeenCalled();
      expect(managementAssignment.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
