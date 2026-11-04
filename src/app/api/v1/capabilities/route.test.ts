/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import { GET } from "@/app/api/v1/capabilities/route";

const { user, managementAssignment } = getModelStubs();
const USER_ID = makeObjectId("user");

describe("GET /api/v1/capabilities", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/capabilities"));
    expect(res.status).toBe(401);
  });

  it("401 when the token user is missing or inactive", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "admin", isActive: false }));
    const res = await GET(buildRequest("/api/v1/capabilities", { token: signToken(USER_ID) }));
    expect(res.status).toBe(401);
  });

  it("returns the actor's role and scoped capabilities", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "admin", isActive: true }));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          _id: makeObjectId("assignment"),
          principalUserId: USER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("property"),
          blockId: "",
          unitId: "",
          permissions: ["unit:read", "unit:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );

    const res = await GET(buildRequest("/api/v1/capabilities", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { role: string; actions: string[]; assignments: unknown[] };
    };
    expect(body.data.role).toBe("admin");
    expect(body.data.actions).toEqual(["unit:read", "unit:manage"]);
    expect(body.data.assignments).toHaveLength(1);
  });
});
