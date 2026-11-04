/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/PropertyClaim", () => ({ PropertyClaim: getModelStubs().propertyClaim }));

import { GET, POST } from "@/app/api/v1/properties/[id]/claim/route";

const { user, property, propertyClaim } = getModelStubs();

const ADMIN_ID = makeObjectId("admin");
const SYSTEM_ADMIN_ID = makeObjectId("sysadmin");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("prop1");
const INVALID_ID = "invalid-id";

describe("/api/v1/properties/[id]/claim", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  describe("POST", () => {
    it("returns 400 for an invalid property id", async () => {
      const res = await POST(
        buildRequest(`/api/v1/properties/${INVALID_ID}/claim`, {
          method: "POST",
          token: signToken(ADMIN_ID, { role: "admin" }),
          body: { evidence: "Deed" },
        }),
        withParams(INVALID_ID),
      );
      expect(res.status).toBe(400);
    });

    it("returns 401 when unauthenticated", async () => {
      const res = await POST(
        buildRequest(`/api/v1/properties/${PROPERTY_ID}/claim`, {
          method: "POST",
          body: { evidence: "Deed" },
        }),
        withParams(PROPERTY_ID),
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 for a non-admin role", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));

      const res = await POST(
        buildRequest(`/api/v1/properties/${PROPERTY_ID}/claim`, {
          method: "POST",
          token: signToken(TENANT_ID, { role: "tenant" }),
          body: { evidence: "Deed" },
        }),
        withParams(PROPERTY_ID),
      );
      expect(res.status).toBe(403);
    });

    it("returns 404 if property does not exist", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      property.findOne.mockReturnValue(buildQuery(null));

      const res = await POST(
        buildRequest(`/api/v1/properties/${PROPERTY_ID}/claim`, {
          method: "POST",
          token: signToken(ADMIN_ID, { role: "admin" }),
          body: { evidence: "Deed" },
        }),
        withParams(PROPERTY_ID),
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 if evidence is missing or blank", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      property.findOne.mockReturnValue(buildQuery(makeProperty({ _id: PROPERTY_ID })));

      const res = await POST(
        buildRequest(`/api/v1/properties/${PROPERTY_ID}/claim`, {
          method: "POST",
          token: signToken(ADMIN_ID, { role: "admin" }),
          body: { evidence: "   " },
        }),
        withParams(PROPERTY_ID),
      );
      expect(res.status).toBe(400);
    });

    it("returns 409 if admin already has an active claim", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      property.findOne.mockReturnValue(buildQuery(makeProperty({ _id: PROPERTY_ID })));
      propertyClaim.findOne.mockReturnValue(buildQuery({ _id: "c1", status: "pending" }));

      const res = await POST(
        buildRequest(`/api/v1/properties/${PROPERTY_ID}/claim`, {
          method: "POST",
          token: signToken(ADMIN_ID, { role: "admin" }),
          body: { evidence: "Deed" },
        }),
        withParams(PROPERTY_ID),
      );
      expect(res.status).toBe(409);
    });

    it("creates a property claim and returns 201", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      property.findOne.mockReturnValue(buildQuery(makeProperty({ _id: PROPERTY_ID })));
      propertyClaim.findOne.mockReturnValue(buildQuery(null));
      const createdClaim = {
        _id: "claim-1",
        propertyId: PROPERTY_ID,
        claimantUserId: ADMIN_ID,
        evidence: "Official deed doc",
        status: "pending",
      };
      propertyClaim.create.mockResolvedValue(createdClaim);

      const res = await POST(
        buildRequest(`/api/v1/properties/${PROPERTY_ID}/claim`, {
          method: "POST",
          token: signToken(ADMIN_ID, { role: "admin" }),
          body: { evidence: "Official deed doc" },
        }),
        withParams(PROPERTY_ID),
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data._id).toBe("claim-1");
    });
  });

  describe("GET", () => {
    it("returns 403 for non-system-admin", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));

      const res = await GET(
        buildRequest(`/api/v1/properties/${PROPERTY_ID}/claim`, {
          token: signToken(ADMIN_ID, { role: "admin" }),
        }),
        withParams(PROPERTY_ID),
      );
      expect(res.status).toBe(403);
    });

    it("allows system-admin to list claims with optional status filter", async () => {
      user.findById.mockReturnValue(
        buildQuery(makeUser({ _id: SYSTEM_ADMIN_ID, role: "system-admin" })),
      );
      const claims = [{ _id: "c1", status: "pending" }];
      propertyClaim.find.mockReturnValue(buildQuery(claims));

      const res = await GET(
        buildRequest(`/api/v1/properties/${PROPERTY_ID}/claim?status=pending`, {
          token: signToken(SYSTEM_ADMIN_ID, { role: "system-admin" }),
        }),
        withParams(PROPERTY_ID),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(claims);
      expect(propertyClaim.find).toHaveBeenCalledWith({
        propertyId: PROPERTY_ID,
        status: "pending",
      });
    });
  });
});
