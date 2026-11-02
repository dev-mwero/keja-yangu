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
vi.mock("@/models/AuditEvent", () => ({ AuditEvent: getModelStubs().auditEvent }));
vi.mock("@/lib/authorization-shadow", () => ({
  shadowSampleRate: vi.fn(() => 1),
  compareAuthorizationShadow: vi.fn().mockResolvedValue(null),
}));

import { compareAuthorizationShadow } from "@/lib/authorization-shadow";
import { requirePermission } from "@/lib/permissions";

const { user, managementAssignment, auditEvent } = getModelStubs();
const compareMock = vi.mocked(compareAuthorizationShadow);
const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("owner");

beforeEach(() => {
  resetModelStubs();
  vi.clearAllMocks();
  user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "system-admin", isActive: true }));
});

describe("requirePermission shadow hook", () => {
  it("compares resource-free decisions without changing the legacy result", async () => {
    const result = await requirePermission(
      buildRequest("/api/v1/properties", { token: signToken(USER_ID) }),
      "property:create",
    );

    expect(result).toBeNull();
    expect(compareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: USER_ID,
        action: "property:create",
        resource: undefined,
        legacyAllowed: true,
      }),
    );
  });

  it("passes the property scope to the comparator", async () => {
    await requirePermission(
      buildRequest("/api/v1/properties", { token: signToken(USER_ID) }),
      "property:edit",
      { resource: { ownerId: OWNER_ID, propertyId: makeObjectId("property") } },
    );

    expect(compareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: { propertyId: expect.any(String) },
      }),
    );
  });

  it("skips comparison when a legacy resource has no property id", async () => {
    await requirePermission(
      buildRequest("/api/v1/properties", { token: signToken(USER_ID) }),
      "property:edit",
      { resource: { ownerId: OWNER_ID } },
    );

    expect(compareMock).not.toHaveBeenCalled();
  });
});

describe("requirePermission route-family enforcement", () => {
  const unitResource = {
    ownerId: USER_ID,
    propertyId: "property-1",
    blockId: "block-1",
    unitId: "unit-1",
  };

  function enableUnitsForAdmin() {
    process.env.AUTHZ_ENFORCE_ROUTE_FAMILIES = "units";
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "admin", isActive: true }));
    auditEvent.create.mockResolvedValue({});
  }

  it("denies when the enabled policy denies but legacy allowed", async () => {
    enableUnitsForAdmin();
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: USER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: "property-1",
          permissions: ["unit:read"],
          status: "active",
        },
      ]),
    );

    const result = await requirePermission(
      buildRequest("/api/v1/units/unit-1", { token: signToken(USER_ID) }),
      "unit:manage",
      { resource: unitResource },
    );

    expect(result?.status).toBe(403);
  });

  it("fails closed when enforcement cannot load assignments", async () => {
    enableUnitsForAdmin();
    managementAssignment.find.mockImplementation(() => {
      throw new Error("db unavailable");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await requirePermission(
      buildRequest("/api/v1/units/unit-1", { token: signToken(USER_ID) }),
      "unit:read",
      { resource: unitResource },
    );

    expect(result?.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("allows when the enabled policy allows but legacy denied", async () => {
    enableUnitsForAdmin();
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: USER_ID,
          accessRole: "admin",
          scopeType: "unit",
          propertyId: "property-1",
          blockId: "block-1",
          unitId: "unit-1",
          permissions: ["unit:read"],
          status: "active",
        },
      ]),
    );

    const result = await requirePermission(
      buildRequest("/api/v1/units/unit-1", { token: signToken(USER_ID) }),
      "unit:read",
      { resource: { ...unitResource, ownerId: OWNER_ID } },
    );

    expect(result).toBeNull();
  });
});
