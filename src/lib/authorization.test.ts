/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import {
  type AssignmentLike,
  assignmentCoversResource,
  authorize,
  evaluatePolicy,
  getCapabilities,
  POLICY_ACTIONS,
  type PolicyAction,
  type PolicyActor,
  roleMaximumActions,
} from "@/lib/authorization";

const NOW = new Date("2026-11-02T00:00:00.000Z");

function actor(overrides: Partial<PolicyActor> = {}): PolicyActor {
  return { userId: "user-1", role: "admin", isActive: true, ...overrides };
}

function assignment(
  overrides: Partial<AssignmentLike> & { _id?: string } = {},
): AssignmentLike & { _id?: string } {
  return {
    principalUserId: "user-1",
    accessRole: "admin",
    scopeType: "property",
    propertyId: "property-1",
    blockId: "",
    unitId: "",
    permissions: ["unit:read", "unit:manage", "property:edit"],
    status: "active",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    ...overrides,
  };
}

describe("evaluatePolicy", () => {
  it("allows system-admin globally", () => {
    const result = evaluatePolicy({
      actor: actor({ role: "system-admin" }),
      action: "ownership:manage",
      resource: { propertyId: "property-1" },
      assignments: [],
      now: NOW,
    });
    expect(result.allowed).toBe(true);
  });

  it("maps the legacy owner role to an admin assignment", () => {
    const result = evaluatePolicy({
      actor: actor({ role: "owner" }),
      action: "unit:read",
      resource: { propertyId: "property-1" },
      assignments: [assignment()],
      now: NOW,
    });
    expect(result.allowed).toBe(true);
  });

  it("denies an owner without an assignment", () => {
    const result = evaluatePolicy({
      actor: actor({ role: "owner" }),
      action: "unit:read",
      resource: { propertyId: "property-1" },
      assignments: [],
      now: NOW,
    });
    expect(result).toMatchObject({ allowed: false, reason: "no-matching-assignment" });
  });

  it("denies a different property", () => {
    const result = evaluatePolicy({
      actor: actor(),
      action: "unit:read",
      resource: { propertyId: "property-2" },
      assignments: [assignment()],
      now: NOW,
    });
    expect(result.allowed).toBe(false);
  });

  it("requires the action in the assignment permissions", () => {
    const result = evaluatePolicy({
      actor: actor(),
      action: "unit:manage",
      resource: { propertyId: "property-1" },
      assignments: [assignment({ permissions: ["unit:read"] })],
      now: NOW,
    });
    expect(result.allowed).toBe(false);
  });

  it("denies assignments that are not active", () => {
    for (const status of ["pending", "suspended", "revoked", "expired"]) {
      const result = evaluatePolicy({
        actor: actor(),
        action: "unit:read",
        resource: { propertyId: "property-1" },
        assignments: [assignment({ status })],
        now: NOW,
      });
      expect(result.allowed).toBe(false);
    }
  });

  it("denies assignments outside their time window", () => {
    const future = evaluatePolicy({
      actor: actor(),
      action: "unit:read",
      resource: { propertyId: "property-1" },
      assignments: [assignment({ startsAt: "2026-12-01T00:00:00.000Z" })],
      now: NOW,
    });
    expect(future.allowed).toBe(false);

    const expired = evaluatePolicy({
      actor: actor(),
      action: "unit:read",
      resource: { propertyId: "property-1" },
      assignments: [assignment({ endsAt: "2026-10-01T00:00:00.000Z" })],
      now: NOW,
    });
    expect(expired.allowed).toBe(false);
  });

  it("enforces the role maximum even when permissions are granted", () => {
    const result = evaluatePolicy({
      actor: actor({ role: "caretaker" }),
      action: "assignment:grant",
      resource: { propertyId: "property-1" },
      assignments: [
        assignment({
          accessRole: "caretaker",
          permissions: ["assignment:grant"],
        }),
      ],
      now: NOW,
    });
    expect(result).toMatchObject({ allowed: false, reason: "role-maximum" });
  });

  it("keeps platform actions with system-admin", () => {
    const result = evaluatePolicy({
      actor: actor(),
      action: "ownership:manage",
      resource: { propertyId: "property-1" },
      assignments: [assignment({ permissions: ["ownership:manage"] })],
      now: NOW,
    });
    expect(result).toMatchObject({ allowed: false, reason: "role-maximum" });
  });

  it("denies archived or merged resources", () => {
    for (const lifecycleState of ["archived", "merged"] as const) {
      const result = evaluatePolicy({
        actor: actor(),
        action: "unit:read",
        resource: { propertyId: "property-1", lifecycleState },
        assignments: [assignment()],
        now: NOW,
      });
      expect(result).toMatchObject({ allowed: false, reason: "resource-not-writable" });
    }
  });

  it("allows resource-free actions only when explicitly listed", () => {
    expect(
      evaluatePolicy({
        actor: actor(),
        action: "property:create",
        assignments: [],
        now: NOW,
      }).allowed,
    ).toBe(true);
    expect(
      evaluatePolicy({
        actor: actor(),
        action: "property:claim",
        assignments: [],
        now: NOW,
      }).allowed,
    ).toBe(true);
    expect(
      evaluatePolicy({
        actor: actor(),
        action: "unit:manage",
        assignments: [assignment()],
        now: NOW,
      }),
    ).toMatchObject({ allowed: false, reason: "resource-required" });
  });

  it("allows tenant self-service actions only", () => {
    expect(
      evaluatePolicy({
        actor: actor({ role: "tenant" }),
        action: "invoice:read-own",
        assignments: [],
        now: NOW,
      }).allowed,
    ).toBe(true);
    expect(
      evaluatePolicy({
        actor: actor({ role: "tenant" }),
        action: "tenant:manage",
        assignments: [],
        now: NOW,
      }).allowed,
    ).toBe(false);
    expect(
      evaluatePolicy({
        actor: actor({ role: "tenant" }),
        action: "unit:read",
        resource: { propertyId: "property-1" },
        assignments: [],
        now: NOW,
      }).allowed,
    ).toBe(true);
  });

  it("uses the union of active assignments", () => {
    const result = evaluatePolicy({
      actor: actor(),
      action: "unit:manage",
      resource: { propertyId: "property-1", blockId: "block-2" },
      assignments: [
        assignment({ scopeType: "block", blockId: "block-1" }),
        assignment({ scopeType: "block", blockId: "block-2" }),
      ],
      now: NOW,
    });
    expect(result.allowed).toBe(true);
  });
});

describe("assignmentCoversResource", () => {
  const base = assignment();

  it("property scope covers the property and all units", () => {
    expect(assignmentCoversResource(base, { propertyId: "property-1" })).toBe(true);
    expect(
      assignmentCoversResource(base, {
        propertyId: "property-1",
        blockId: "block-1",
        unitId: "unit-1",
      }),
    ).toBe(true);
  });

  it("block scope covers only that block's units", () => {
    const block = assignment({ scopeType: "block", blockId: "block-1" });
    expect(
      assignmentCoversResource(block, {
        propertyId: "property-1",
        blockId: "block-1",
        unitId: "unit-1",
      }),
    ).toBe(true);
    expect(
      assignmentCoversResource(block, {
        propertyId: "property-1",
        blockId: "block-2",
        unitId: "unit-2",
      }),
    ).toBe(false);
  });

  it("unit scope covers only that unit", () => {
    const unit = assignment({ scopeType: "unit", blockId: "block-1", unitId: "unit-1" });
    expect(
      assignmentCoversResource(unit, {
        propertyId: "property-1",
        blockId: "block-1",
        unitId: "unit-1",
      }),
    ).toBe(true);
    expect(
      assignmentCoversResource(unit, {
        propertyId: "property-1",
        blockId: "block-1",
        unitId: "unit-2",
      }),
    ).toBe(false);
    expect(assignmentCoversResource(unit, { propertyId: "property-1" })).toBe(false);
  });
});

describe("authorize", () => {
  const { user, managementAssignment } = getModelStubs();

  beforeEach(() => {
    resetModelStubs();
  });

  it("loads the actor and active assignments from the database", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: "user-1", role: "admin", isActive: true }));
    managementAssignment.find.mockReturnValue(buildQuery([assignment()]));

    const result = await authorize("user-1", "unit:read", { propertyId: "property-1" });

    expect(result.allowed).toBe(true);
    expect(managementAssignment.find).toHaveBeenCalledWith({
      principalUserId: "user-1",
      status: "active",
    });
  });

  it("denies an inactive actor", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: "user-1", role: "admin", isActive: false }));
    const result = await authorize("user-1", "unit:read", { propertyId: "property-1" });
    expect(result.allowed).toBe(false);
    expect(managementAssignment.find).not.toHaveBeenCalled();
  });
});

describe("getCapabilities", () => {
  const { user, managementAssignment } = getModelStubs();

  beforeEach(() => {
    resetModelStubs();
  });

  it("returns null for an inactive user", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: "user-1", role: "admin", isActive: false }));
    await expect(getCapabilities("user-1")).resolves.toBeNull();
    expect(managementAssignment.find).not.toHaveBeenCalled();
  });

  it("returns tenant self-service actions only", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: "user-1", role: "tenant", isActive: true }));
    const capabilities = await getCapabilities("user-1");
    expect(capabilities?.global).toBe(false);
    expect(capabilities?.actions).toContain("invoice:read-own");
    expect(capabilities?.actions).toContain("unit:read");
    expect(capabilities?.actions).not.toContain("tenant:manage");
  });

  it("returns global platform capabilities for system-admin", async () => {
    user.findById.mockReturnValue(
      buildQuery({ _id: "user-1", role: "system-admin", isActive: true }),
    );
    const capabilities = await getCapabilities("user-1");
    expect(capabilities?.global).toBe(true);
    expect(capabilities?.actions).toContain("property-type:manage");
    expect(capabilities?.actions).toContain("ownership:manage");
    expect(managementAssignment.find).not.toHaveBeenCalled();
  });

  it("returns the intersection of active assignments and the role maximum", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: "user-1", role: "admin", isActive: true }));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          ...assignment({
            _id: "assignment-1",
            permissions: ["unit:manage", "ownership:manage"],
            startsAt: "2026-01-01T00:00:00.000Z",
            endsAt: null,
          }),
        },
        {
          ...assignment({
            _id: "assignment-expired",
            propertyId: "property-2",
            endsAt: "2026-10-01T00:00:00.000Z",
          }),
        },
        {
          ...assignment({
            _id: "assignment-wrong-role",
            accessRole: "custodian",
          }),
        },
      ]),
    );

    const capabilities = await getCapabilities("user-1");
    expect(capabilities?.assignments).toHaveLength(1);
    expect(capabilities?.assignments[0]).toMatchObject({
      assignmentId: "assignment-1",
      accessRole: "admin",
      propertyId: "property-1",
      blockId: "",
      unitId: "",
      actions: ["unit:manage"],
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: null,
    });
    expect(capabilities?.actions).toEqual(["unit:manage"]);
  });

  it("does not leak caretaker permissions above the role maximum", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: "user-1", role: "caretaker", isActive: true }));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          ...assignment({
            _id: "assignment-1",
            accessRole: "caretaker",
            permissions: ["unit:read", "assignment:grant", "ownership:read"],
          }),
        },
      ]),
    );

    const capabilities = await getCapabilities("user-1");
    expect(capabilities?.actions).toEqual(["unit:read"]);
  });
});

describe("policy action matrix", () => {
  const PLATFORM_ACTIONS = new Set<PolicyAction>([
    "property-type:manage",
    "recycle-bin:manage",
    "ownership:manage",
  ]);

  const resource = {
    propertyId: "property-1",
    blockId: "block-1",
    unitId: "unit-1",
  };

  for (const role of ["admin", "custodian", "caretaker"] as const) {
    it(`matches the ${role} role maximum for every action`, () => {
      const maximum = new Set(roleMaximumActions(role));
      for (const action of POLICY_ACTIONS) {
        const result = evaluatePolicy({
          actor: actor({ role }),
          action,
          resource,
          assignments: [
            assignment({
              accessRole: role,
              permissions: [action],
              status: "active",
            }),
          ],
          now: NOW,
        });
        const expected = maximum.has(action) && !PLATFORM_ACTIONS.has(action);
        expect(result.allowed, `${role} ${action}`).toBe(expected);
      }
    });
  }

  it("allows only tenant self-service actions for tenants", () => {
    const tenantActions = new Set<PolicyAction>([
      "invoice:read-own",
      "notification:read-own",
      "notification:manage",
      "settings:read",
      "settings:write",
      "complaint:read-own",
      "complaint:create",
      "chat:read-own",
      "chat:send",
      "announcement:read",
      "document:read-own",
      "unit:read",
      "move-request:create",
    ]);
    for (const action of POLICY_ACTIONS) {
      const result = evaluatePolicy({
        actor: actor({ role: "tenant" }),
        action,
        resource,
        assignments: [],
        now: NOW,
      });
      expect(result.allowed, action).toBe(tenantActions.has(action));
    }
  });

  it("allows every action for system-admin", () => {
    for (const action of POLICY_ACTIONS) {
      const result = evaluatePolicy({
        actor: actor({ role: "system-admin" }),
        action,
        resource,
        assignments: [],
        now: NOW,
      });
      expect(result.allowed, action).toBe(true);
    }
  });
});
