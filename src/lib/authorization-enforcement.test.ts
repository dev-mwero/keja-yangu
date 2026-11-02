/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";

vi.mock("@/lib/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authorization")>();
  return { ...actual, loadActorContext: vi.fn() };
});
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn() }));
vi.mock("@/lib/policy-resources", () => ({ loadUnitResource: vi.fn() }));

import { writeAuditEvent } from "@/lib/audit";
import { type ActorContext, loadActorContext } from "@/lib/authorization";
import {
  enforcedRouteFamilies,
  enforceScopedAuthorization,
  isRouteFamilyEnforced,
  routeFamily,
  toPolicyResource,
} from "@/lib/authorization-enforcement";
import { loadUnitResource } from "@/lib/policy-resources";

const loadContextMock = vi.mocked(loadActorContext);
const writeAuditMock = vi.mocked(writeAuditEvent);
const loadUnitResourceMock = vi.mocked(loadUnitResource);
const USER_ID = "user-1";

function context(
  role: ActorContext["actor"]["role"],
  assignment?: Partial<ActorContext["assignments"][number]>,
): ActorContext {
  return {
    actor: { userId: USER_ID, role, isActive: true },
    assignments: assignment
      ? [
          {
            principalUserId: USER_ID,
            accessRole: role === "owner" ? "admin" : role,
            scopeType: "property",
            propertyId: "property-1",
            permissions: ["unit:read", "unit:manage"],
            status: "active",
            ...assignment,
          } as ActorContext["assignments"][number],
        ]
      : [],
  };
}

function request(path = "/api/v1/units/unit-1") {
  return buildRequest(path, { token: signToken(USER_ID) });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTHZ_ENFORCE_ROUTE_FAMILIES = "units";
  loadUnitResourceMock.mockResolvedValue({
    ok: true,
    resource: {
      propertyId: "property-1",
      blockId: "block-1",
      unitId: "unit-1",
      lifecycleState: "active",
    },
  });
});

afterEach(() => {
  delete process.env.AUTHZ_ENFORCE_ROUTE_FAMILIES;
});

describe("route-family enforcement configuration", () => {
  it("parses comma-separated families and derives the request family", () => {
    process.env.AUTHZ_ENFORCE_ROUTE_FAMILIES = "Units, properties ,";
    expect([...enforcedRouteFamilies()]).toEqual(["units", "properties"]);
    expect(routeFamily(request("/api/v1/units/unit-1"))).toBe("units");
    expect(isRouteFamilyEnforced(request("/api/v1/units/unit-1"))).toBe(true);
    expect(isRouteFamilyEnforced(request("/api/v1/properties/property-1"))).toBe(true);
    expect(isRouteFamilyEnforced(request("/api/v1/leases/lease-1"))).toBe(false);
  });

  it("supports the staging wildcard", () => {
    process.env.AUTHZ_ENFORCE_ROUTE_FAMILIES = "*";
    expect(isRouteFamilyEnforced(request("/api/v1/anything"))).toBe(true);
  });
});

describe("toPolicyResource", () => {
  it("infers the property id from a property document", () => {
    expect(toPolicyResource({ _id: "property-1" })).toEqual({ propertyId: "property-1" });
  });

  it("keeps block and unit scope", () => {
    expect(
      toPolicyResource({
        propertyId: "property-1",
        blockId: "block-1",
        unitId: "unit-1",
      }),
    ).toEqual({ propertyId: "property-1", blockId: "block-1", unitId: "unit-1" });
  });

  it("does not treat a narrower resource without a property as resolvable", () => {
    expect(toPolicyResource({ unitId: "unit-1" })).toBeUndefined();
  });
});

describe("enforceScopedAuthorization", () => {
  it("does nothing when the route family is disabled", async () => {
    process.env.AUTHZ_ENFORCE_ROUTE_FAMILIES = "properties";
    await expect(
      enforceScopedAuthorization({
        request: request(),
        actorUserId: USER_ID,
        action: "unit:read",
        resource: { propertyId: "property-1", unitId: "unit-1" },
        legacyAllowed: true,
      }),
    ).resolves.toBeNull();
    expect(loadContextMock).not.toHaveBeenCalled();
  });

  it("keeps legacy access for a tenant", async () => {
    loadContextMock.mockResolvedValue({
      actor: { userId: USER_ID, role: "tenant", isActive: true },
      assignments: [],
    });
    await expect(
      enforceScopedAuthorization({
        request: request(),
        actorUserId: USER_ID,
        action: "unit:read",
        resource: { propertyId: "property-1", unitId: "unit-1" },
        legacyAllowed: true,
      }),
    ).resolves.toBeNull();
  });

  it("keeps legacy access for a legacy staff actor with no assignments", async () => {
    loadContextMock.mockResolvedValue(context("caretaker"));
    await expect(
      enforceScopedAuthorization({
        request: request(),
        actorUserId: USER_ID,
        action: "unit:read",
        resource: { propertyId: "property-1", unitId: "unit-1" },
        legacyAllowed: true,
      }),
    ).resolves.toBeNull();
  });

  it("denies a scoped staff actor whose assignment lacks the permission", async () => {
    loadContextMock.mockResolvedValue(context("caretaker", { permissions: ["unit:read"] }));
    const decision = await enforceScopedAuthorization({
      request: request(),
      actorUserId: USER_ID,
      action: "unit:manage",
      resource: { propertyId: "property-1", unitId: "unit-1" },
      legacyAllowed: true,
    });
    expect(decision).toEqual({ allowed: false, reason: "no-matching-assignment" });
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authz.enforce.mismatch",
        before: { source: "legacy", allowed: true },
        after: { source: "policy", allowed: false, reason: "no-matching-assignment" },
      }),
    );
  });

  it("allows a new admin through an assignment even when legacy denied", async () => {
    loadContextMock.mockResolvedValue(context("admin", { accessRole: "admin" }));
    const decision = await enforceScopedAuthorization({
      request: request(),
      actorUserId: USER_ID,
      action: "unit:read",
      resource: { propertyId: "property-1", unitId: "unit-1" },
      legacyAllowed: false,
    });
    expect(decision).toEqual({ allowed: true, reason: "assignment" });
  });

  it("resolves the block for a unit-scoped assignment before policy evaluation", async () => {
    loadContextMock.mockResolvedValue(
      context("caretaker", {
        scopeType: "unit",
        blockId: "block-1",
        unitId: "unit-1",
        permissions: ["unit:manage"],
      }),
    );

    await expect(
      enforceScopedAuthorization({
        request: request(),
        actorUserId: USER_ID,
        action: "unit:manage",
        resource: { propertyId: "property-1", unitId: "unit-1" },
        legacyAllowed: false,
      }),
    ).resolves.toEqual({ allowed: true, reason: "assignment" });
    expect(loadUnitResourceMock).toHaveBeenCalledWith("unit-1");
  });

  it("denies an assignment check when the unit parent chain is inconsistent", async () => {
    loadContextMock.mockResolvedValue(context("caretaker", { permissions: ["unit:manage"] }));
    loadUnitResourceMock.mockResolvedValue({ ok: false, reason: "inconsistent-parent" });

    await expect(
      enforceScopedAuthorization({
        request: request(),
        actorUserId: USER_ID,
        action: "unit:manage",
        resource: { propertyId: "property-1", unitId: "unit-1" },
        legacyAllowed: true,
      }),
    ).resolves.toEqual({ allowed: false, reason: "inconsistent-resource" });
  });

  it("respects unit scope on block assignments", async () => {
    loadUnitResourceMock.mockResolvedValue({
      ok: true,
      resource: {
        propertyId: "property-1",
        blockId: "block-2",
        unitId: "unit-1",
        lifecycleState: "active",
      },
    });
    loadContextMock.mockResolvedValue(
      context("caretaker", {
        scopeType: "block",
        blockId: "block-1",
      }),
    );
    await expect(
      enforceScopedAuthorization({
        request: request(),
        actorUserId: USER_ID,
        action: "unit:manage",
        resource: { propertyId: "property-1", blockId: "block-2", unitId: "unit-1" },
        legacyAllowed: true,
      }),
    ).resolves.toEqual({ allowed: false, reason: "no-matching-assignment" });
  });

  it("falls back when a resource-required action has no resolvable property", async () => {
    await expect(
      enforceScopedAuthorization({
        request: request(),
        actorUserId: USER_ID,
        action: "unit:read",
        resource: { unitId: "unit-1" },
        legacyAllowed: true,
      }),
    ).resolves.toBeNull();
  });
});
