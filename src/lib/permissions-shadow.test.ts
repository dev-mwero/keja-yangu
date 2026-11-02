/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/lib/authorization-shadow", () => ({
  shadowSampleRate: vi.fn(() => 1),
  compareAuthorizationShadow: vi.fn().mockResolvedValue(null),
}));

import { compareAuthorizationShadow } from "@/lib/authorization-shadow";
import { requirePermission } from "@/lib/permissions";

const { user } = getModelStubs();
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
