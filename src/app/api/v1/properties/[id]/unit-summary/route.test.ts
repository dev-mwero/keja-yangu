/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import { GET } from "@/app/api/v1/properties/[id]/unit-summary/route";

const { user, property, unit, managementAssignment } = getModelStubs();
const PROPERTY_ID = makeObjectId("summary-property");
const OWNER_ID = makeObjectId("summary-owner");
const CARETAKER_ID = makeObjectId("summary-caretaker");

describe("GET /api/v1/properties/[id]/unit-summary", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("rejects invalid property ids", async () => {
    const response = await GET(
      buildRequest("/api/v1/properties/invalid/unit-summary"),
      withParams("invalid"),
    );

    expect(response.status).toBe(400);
    expect(property.findOne).not.toHaveBeenCalled();
  });

  it("summarizes live units by status, block, and floor", async () => {
    const publicProperty = {
      ...makeProperty({ _id: PROPERTY_ID }),
      blocks: [
        { name: "B", order: 1 },
        { name: "A", order: 0 },
      ],
    };
    property.findOne.mockReturnValue(buildQuery(publicProperty));
    unit.find.mockReturnValue(
      buildQuery([
        {
          blockName: "B",
          floorLevel: 1,
          floorLabel: "First",
          status: "occupied",
        },
        {
          blockName: "A",
          floorLevel: 0,
          floorLabel: "",
          status: "available",
        },
        {
          blockName: "B",
          floorLevel: 1,
          floorLabel: "First",
          status: "available",
        },
      ]),
    );

    const response = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/unit-summary`),
      withParams(PROPERTY_ID),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      propertyId: PROPERTY_ID,
      totalUnits: 3,
      byStatus: { available: 2, occupied: 1, maintenance: 0 },
      floors: [
        { block: "A", label: "Ground", total: 1, available: 1 },
        { block: "B", label: "First", level: 1, total: 2, available: 1, occupied: 1 },
      ],
      blocks: [
        { name: "A", total: 1, available: 1 },
        { name: "B", total: 2, available: 1, occupied: 1 },
      ],
    });
  });

  it("403 when a caretaker is not assigned to the property", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CARETAKER_ID,
          role: "caretaker",
        }),
      ),
    );
    property.findOne.mockReturnValue(
      buildQuery(
        makeProperty({
          _id: PROPERTY_ID,
          ownerId: OWNER_ID,
        }),
      ),
    );

    const response = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/unit-summary`, {
        token: signToken(CARETAKER_ID, { role: "caretaker" }),
      }),
      withParams(PROPERTY_ID),
    );

    expect(response.status).toBe(403);
    expect(unit.find).not.toHaveBeenCalled();
  });

  it("allows a caretaker assigned to the property", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CARETAKER_ID,
          role: "caretaker",
        }),
      ),
    );
    property.findOne.mockReturnValue(
      buildQuery(
        makeProperty({
          _id: PROPERTY_ID,
          ownerId: OWNER_ID,
        }),
      ),
    );
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: ["unit:read"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    unit.find.mockReturnValue(buildQuery([]));

    const response = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/unit-summary`, {
        token: signToken(CARETAKER_ID, { role: "caretaker" }),
      }),
      withParams(PROPERTY_ID),
    );

    expect(response.status).toBe(200);
  });
});
