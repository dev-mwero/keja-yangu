/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action, CaretakerPrivilege, Role } from "@/lib/permissions";
import {
  getTenantScope,
  isFullControlRole,
  isPrivilegedCustodian,
  requirePermission,
  tenantMatchesScope,
} from "@/lib/permissions";
import { buildRequest, expiredToken, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser, type TestUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
// Async factories resolve `getModelStubs` via dynamic import, so the mock
// cannot race the static `@/test/utils/*` import evaluation below.
vi.mock("@/models/User", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { User: get().user };
});
vi.mock("@/models/Property", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Property: get().property };
});
vi.mock("@/models/ManagementAssignment", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { ManagementAssignment: get().managementAssignment };
});
vi.mock("@/models/Unit", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Unit: get().unit };
});
vi.mock("@/models/Lease", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { Lease: get().lease };
});

const { user, property, managementAssignment, unit, lease } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const CUSTODIAN_ID = makeObjectId("custodian");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const PROPERTY_ID = makeObjectId("property");

function ownerUser(overrides: Partial<TestUser> = {}) {
  return makeUser({ _id: OWNER_ID, role: "owner", ...overrides });
}

function caretakerUser(privileges: CaretakerPrivilege[], overrides: Partial<TestUser> = {}) {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OTHER_OWNER_ID,
    privileges,
    ...overrides,
  });
}

function tenantUser() {
  return makeUser({ _id: makeObjectId("tenant"), role: "tenant" });
}

function custodianUser(overrides: Partial<TestUser> = {}) {
  return makeUser({
    _id: CUSTODIAN_ID,
    role: "custodian",
    managedByOwnerId: OTHER_OWNER_ID,
    ...overrides,
  });
}

async function guard(
  action: Action,
  opts:
    | { resource?: { ownerId?: string; caretakerIds?: string[]; propertyId?: string } }
    | undefined,
  mocker: TestUser,
) {
  user.findById.mockReturnValue(buildQuery(mocker));
  return requirePermission(
    buildRequest("/api/v1/properties", { token: signToken(mocker._id) }),
    action,
    opts,
  );
}

const ALL_ACTIONS: Action[] = [
  "property:create",
  "property:edit",
  "property:delete",
  "tenant:manage",
];

describe("isFullControlRole", () => {
  it("returns true for admin and system-admin", () => {
    expect(isFullControlRole("admin")).toBe(true);
    expect(isFullControlRole("system-admin")).toBe(true);
  });

  it("returns false for owner", () => {
    expect(isFullControlRole("owner")).toBe(false);
  });

  it("returns false for caretaker and tenant", () => {
    expect(isFullControlRole("caretaker")).toBe(false);
    expect(isFullControlRole("tenant")).toBe(false);
  });
});

describe("isPrivilegedCustodian", () => {
  const privileged = {
    role: "custodian" as const,
    privileges: ["assign_privileges"],
    isActive: true,
    managedByOwnerId: "owner-1",
  };

  it("is true only for active, owner-bound custodians with assign_privileges", () => {
    expect(isPrivilegedCustodian(privileged)).toBe(true);
    expect(isPrivilegedCustodian({ ...privileged, privileges: [] })).toBe(false);
    expect(isPrivilegedCustodian({ ...privileged, isActive: false })).toBe(false);
    expect(isPrivilegedCustodian({ ...privileged, managedByOwnerId: "" })).toBe(false);
    expect(isPrivilegedCustodian({ ...privileged, role: "owner" })).toBe(false);
    expect(isPrivilegedCustodian({ ...privileged, role: "caretaker" })).toBe(false);
  });
});

describe("requirePermission — caretaker privilege gating", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  function caretakerWithAssignment(
    privileges: Array<"create_property" | "delete_assigned_property">,
  ) {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CARETAKER_ID,
          role: "caretaker",
          managedByOwnerId: OTHER_OWNER_ID,
          privileges: privileges as ReturnType<typeof makeUser>["privileges"],
        }),
      ),
    );
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["property:create"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
  }

  it("scoped policy cannot grant property:create without the create_property privilege", async () => {
    caretakerWithAssignment([]);
    const res = await requirePermission(
      buildRequest("/api/v1/properties", { token: signToken(CARETAKER_ID) }),
      "property:create",
    );
    expect(res?.status).toBe(403);
  });

  it("create_property privilege still permits property:create", async () => {
    caretakerWithAssignment(["create_property"]);
    const res = await requirePermission(
      buildRequest("/api/v1/properties", { token: signToken(CARETAKER_ID) }),
      "property:create",
    );
    expect(res).toBeNull();
  });
});

describe("requirePermission — authentication failure modes", () => {
  beforeEach(() => {
    resetModelStubs();
    // Staff without assignments fall back to the legacy managedByOwnerId rules.
    managementAssignment.find.mockReturnValue(buildQuery([]));
  });

  it("401 when no token is present", async () => {
    const res = await requirePermission(buildRequest("/api/v1/properties"), "property:create");
    expect(res?.status).toBe(401);
  });

  it("401 when token is garbage", async () => {
    const res = await requirePermission(
      buildRequest("/api/v1/properties", { token: "garbage.token.value" }),
      "property:create",
    );
    expect(res?.status).toBe(401);
  });

  it("401 when token is expired", async () => {
    const res = await requirePermission(
      buildRequest("/api/v1/properties", { token: expiredToken(OWNER_ID) }),
      "property:create",
    );
    expect(res?.status).toBe(401);
  });

  it("401 when the user is inactive", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser({ isActive: false })));
    const res = await requirePermission(
      buildRequest("/api/v1/properties", { token: signToken(OWNER_ID) }),
      "property:create",
    );
    expect(res?.status).toBe(401);
  });

  it("401 when the token's tokenVersion is stale", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser({ tokenVersion: 5 })));
    const res = await requirePermission(
      buildRequest("/api/v1/properties", {
        token: signToken(OWNER_ID, { tokenVersion: 4 }),
      }),
      "property:create",
    );
    expect(res?.status).toBe(401);
  });

  it("allows a matching tokenVersion", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: OWNER_ID, role: "admin", tokenVersion: 3 })),
    );
    const res = await requirePermission(
      buildRequest("/api/v1/properties", {
        token: signToken(OWNER_ID, { tokenVersion: 3 }),
      }),
      "property:create",
    );
    expect(res).toBeNull();
  });
});

describe("requirePermission — owner", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("denies every action (unsupported role)", async () => {
    for (const action of ALL_ACTIONS) {
      expect((await guard(action, undefined, ownerUser()))?.status).toBe(403);
    }
  });

  it("403 for edit/delete of own property", async () => {
    const resource = { ownerId: OWNER_ID, caretakerIds: [] };
    expect((await guard("property:edit", { resource }, ownerUser()))?.status).toBe(403);
    expect((await guard("property:delete", { resource }, ownerUser()))?.status).toBe(403);
  });

  it("403 for edit/delete of a foreign owner's property", async () => {
    const resource = { ownerId: OTHER_OWNER_ID, caretakerIds: [] };
    expect((await guard("property:edit", { resource }, ownerUser()))?.status).toBe(403);
    expect((await guard("property:delete", { resource }, ownerUser()))?.status).toBe(403);
  });
});

describe("requirePermission — property-type:manage", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("allows the system admin", async () => {
    const admin = makeUser({ _id: makeObjectId("admin"), role: "system-admin" });
    expect(await guard("property-type:manage", undefined, admin)).toBeNull();
  });

  it("forbids owners, custodians and caretakers", async () => {
    expect((await guard("property-type:manage", undefined, ownerUser()))?.status).toBe(403);
    expect((await guard("property-type:manage", undefined, custodianUser()))?.status).toBe(403);
    expect((await guard("property-type:manage", undefined, caretakerUser([])))?.status).toBe(403);
  });
});

describe("requirePermission — recycle-bin:manage", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("allows the system admin", async () => {
    const admin = makeUser({ _id: makeObjectId("admin"), role: "system-admin" });
    expect(await guard("recycle-bin:manage", undefined, admin)).toBeNull();
  });

  it("forbids owners, custodians and caretakers", async () => {
    expect((await guard("recycle-bin:manage", undefined, ownerUser()))?.status).toBe(403);
    expect((await guard("recycle-bin:manage", undefined, custodianUser()))?.status).toBe(403);
    expect((await guard("recycle-bin:manage", undefined, caretakerUser([])))?.status).toBe(403);
  });
});

describe("requirePermission — caretaker", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  function assignment(permissions: string[]) {
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions,
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
  }

  it("403 for all actions when the caretaker is orphaned (no assignments)", async () => {
    const mocker = caretakerUser([], { managedByOwnerId: "" });
    for (const action of ALL_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });

  it("403 for all actions when the caretaker has no privileges and no assignments (C0)", async () => {
    const mocker = caretakerUser([]);
    for (const action of ALL_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });

  it("C1 — create_property permits property:create only (privilege gate)", async () => {
    const mocker = caretakerUser(["create_property"]);
    expect(await guard("property:create", undefined, mocker)).toBeNull();
    expect((await guard("property:edit", undefined, mocker))?.status).toBe(403);
    expect((await guard("property:delete", undefined, mocker))?.status).toBe(403);
    expect((await guard("tenant:manage", undefined, mocker))?.status).toBe(403);
  });

  it("C1 — create_property denied without the privilege", async () => {
    const mocker = caretakerUser([]);
    expect((await guard("property:create", undefined, mocker))?.status).toBe(403);
  });

  it("C2 — assignment with property:edit permits in-scope edit", async () => {
    const mocker = caretakerUser([]);
    assignment(["property:edit"]);
    expect(
      await guard("property:edit", { resource: { propertyId: PROPERTY_ID } }, mocker),
    ).toBeNull();
  });

  it("C2 — assignment without property:edit denies even with edit_property privilege", async () => {
    const mocker = caretakerUser(["edit_property"]);
    assignment([]);
    expect(
      (await guard("property:edit", { resource: { propertyId: PROPERTY_ID } }, mocker))?.status,
    ).toBe(403);
  });

  it("C2 — out-of-scope property denied", async () => {
    const mocker = caretakerUser([]);
    assignment(["property:edit"]);
    const foreignPropertyId = makeObjectId("foreign-property");
    expect(
      (await guard("property:edit", { resource: { propertyId: foreignPropertyId } }, mocker))
        ?.status,
    ).toBe(403);
  });

  it("C3 — delete_assigned_property requires privilege AND assignment", async () => {
    const mocker = caretakerUser(["delete_assigned_property"]);
    assignment(["property:delete"]);
    expect(
      await guard("property:delete", { resource: { propertyId: PROPERTY_ID } }, mocker),
    ).toBeNull();

    // privilege present but no assignment permission -> denied
    const mocker2 = caretakerUser(["delete_assigned_property"]);
    assignment([]);
    expect(
      (await guard("property:delete", { resource: { propertyId: PROPERTY_ID } }, mocker2))?.status,
    ).toBe(403);

    // assignment permission present but no privilege -> denied
    const mocker3 = caretakerUser([]);
    assignment(["property:delete"]);
    expect(
      (await guard("property:delete", { resource: { propertyId: PROPERTY_ID } }, mocker3))?.status,
    ).toBe(403);
  });

  it("C4 — assignment with tenant:manage permits tenant:manage", async () => {
    const mocker = caretakerUser([]);
    assignment(["tenant:manage"]);
    expect(
      await guard("tenant:manage", { resource: { propertyId: PROPERTY_ID } }, mocker),
    ).toBeNull();
  });

  it("C4 — assignment without tenant:manage denies even with manage_tenants privilege", async () => {
    const mocker = caretakerUser(["manage_tenants"]);
    assignment([]);
    expect(
      (await guard("tenant:manage", { resource: { propertyId: PROPERTY_ID } }, mocker))?.status,
    ).toBe(403);
  });

  it("C5 — assignment with unit:manage permits unit:manage", async () => {
    const mocker = caretakerUser([]);
    assignment(["unit:manage"]);
    expect(
      await guard("unit:manage", { resource: { propertyId: PROPERTY_ID } }, mocker),
    ).toBeNull();
  });

  it("C5 — assignment without unit:manage denies", async () => {
    const mocker = caretakerUser(["manage_units"]);
    assignment([]);
    expect(
      (await guard("unit:manage", { resource: { propertyId: PROPERTY_ID } }, mocker))?.status,
    ).toBe(403);
  });

  it("unit:read requires assignment coverage", async () => {
    const mocker = caretakerUser([]);
    assignment(["unit:read"]);
    expect(await guard("unit:read", { resource: { propertyId: PROPERTY_ID } }, mocker)).toBeNull();

    assignment([]);
    expect(
      (await guard("unit:read", { resource: { propertyId: PROPERTY_ID } }, mocker))?.status,
    ).toBe(403);
  });

  it("C6 — assignment with move-request:manage permits move-request:manage", async () => {
    const mocker = caretakerUser([]);
    assignment(["move-request:manage"]);
    expect(
      await guard("move-request:manage", { resource: { propertyId: PROPERTY_ID } }, mocker),
    ).toBeNull();
  });

  it("C6 — assignment without move-request:manage denies", async () => {
    const mocker = caretakerUser(["process_move_requests"]);
    assignment([]);
    expect(
      (await guard("move-request:manage", { resource: { propertyId: PROPERTY_ID } }, mocker))
        ?.status,
    ).toBe(403);
  });

  it("C7 — assignment with application:manage permits application:manage", async () => {
    const mocker = caretakerUser([]);
    assignment(["application:manage"]);
    expect(
      await guard("application:manage", { resource: { propertyId: PROPERTY_ID } }, mocker),
    ).toBeNull();
  });

  it("C7 — assignment without application:manage denies", async () => {
    const mocker = caretakerUser(["manage_tenants"]);
    assignment([]);
    expect(
      (await guard("application:manage", { resource: { propertyId: PROPERTY_ID } }, mocker))
        ?.status,
    ).toBe(403);
  });

  it("C7 — caretakers cannot manage custodians", async () => {
    const mocker = caretakerUser(["manage_tenants", "edit_property"]);
    expect((await guard("custodian:manage", undefined, mocker))?.status).toBe(403);
  });
});

describe("requirePermission — tenant", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for every action", async () => {
    const mocker = tenantUser();
    for (const action of ALL_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });
});

describe("getTenantScope", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await getTenantScope(buildRequest("/api/v1/tenants"));
    expect((res as Response).status).toBe(401);
  });

  it("401 when the user is inactive", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser({ isActive: false })));
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(OWNER_ID) }),
    );
    expect((res as Response).status).toBe(401);
  });

  it("owner role has no legacy scope (denied)", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(OWNER_ID) }),
    );
    expect((res as Response).status).toBe(403);
  });

  it("scopes an admin to property assignments rather than its own user id", async () => {
    const adminId = makeObjectId("assigned-admin");
    const assignedPropertyId = makeObjectId("admin-property");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: adminId, role: "admin" })));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          accessRole: "admin",
          scopeType: "property",
          propertyId: assignedPropertyId,
          permissions: ["property:read", "tenant:manage", "lease:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );

    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(adminId) }),
    );

    expect(res instanceof Response).toBe(false);
    if (res instanceof Response) return;
    expect(res.filter).toEqual({ propertyId: { $in: [assignedPropertyId] } });
    expect(res.leaseFilter).toEqual({ propertyId: { $in: [assignedPropertyId] } });
  });

  it("scopes an admin's unit assignment to tenants on that unit", async () => {
    const adminId = makeObjectId("unit-admin");
    const propertyId = makeObjectId("unit-property");
    const blockId = makeObjectId("unit-block");
    const unitId = makeObjectId("unit-scope");
    const tenantId = makeObjectId("unit-tenant");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: adminId, role: "admin" })));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          accessRole: "admin",
          scopeType: "unit",
          propertyId,
          blockId,
          unitId,
          permissions: ["tenant:manage", "lease:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    unit.find.mockReturnValue(buildQuery([{ _id: unitId, propertyId }]));
    lease.find.mockReturnValue(buildQuery([{ tenantId }]));

    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(adminId) }),
      "tenant:manage",
    );

    expect(res instanceof Response).toBe(false);
    if (res instanceof Response) return;
    expect(res.filter).toEqual({ _id: { $in: [tenantId] } });
    expect(res.leaseFilter).toEqual({ unitId: { $in: [unitId] } });
    expect(unit.find).toHaveBeenCalledWith({
      $or: [{ _id: unitId, propertyId }],
    });
    expect(lease.find).toHaveBeenCalledWith({
      unitId: { $in: [unitId] },
      status: "active",
    });
  });

  it("system-admin scope has an empty filter", async () => {
    const adminId = makeObjectId("admin");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: adminId, role: "system-admin" })));
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(adminId) }),
    );
    expect(res instanceof Response).toBe(false);
    if (res instanceof Response) return;
    expect(res.filter).toEqual({});
  });

  it("caretaker scope follows active assignments (no legacy property query)", async () => {
    const p1 = makeObjectId("p1");
    const p2 = makeObjectId("p2");
    user.findById.mockReturnValue(buildQuery(caretakerUser(["manage_tenants"])));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: p1,
          permissions: ["tenant:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
        {
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: p2,
          permissions: ["tenant:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(CARETAKER_ID) }),
    );
    expect(res instanceof Response).toBe(false);
    if (res instanceof Response) return;
    expect(res.filter).toEqual({ propertyId: { $in: [p1, p2] } });
    expect(res.assignedPropertyIds).toEqual([p1, p2]);
    expect(property.find).not.toHaveBeenCalled();
  });

  it("403 for an orphaned caretaker", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser([], { managedByOwnerId: "" })));
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(CARETAKER_ID) }),
    );
    expect((res as Response).status).toBe(403);
  });

  it("403 for a tenant user", async () => {
    const t = tenantUser();
    user.findById.mockReturnValue(buildQuery(t));
    const res = await getTenantScope(buildRequest("/api/v1/tenants", { token: signToken(t._id) }));
    expect((res as Response).status).toBe(403);
  });
});

describe("tenantMatchesScope", () => {
  it("owner role matches nothing (legacy scoping removed)", () => {
    const scope = {
      filter: { ownerId: OWNER_ID },
      userId: OWNER_ID,
      role: "owner" as Role,
      managedByOwnerId: "",
    };
    expect(tenantMatchesScope({ ownerId: OWNER_ID, propertyId: makeObjectId("p1") }, scope)).toBe(
      false,
    );
  });

  it("system-admin matches every tenant", () => {
    const scope = {
      filter: {},
      userId: makeObjectId("admin"),
      role: "system-admin" as Role,
      managedByOwnerId: "",
    };
    expect(
      tenantMatchesScope({ ownerId: OTHER_OWNER_ID, propertyId: makeObjectId("p1") }, scope),
    ).toBe(true);
  });

  it("caretaker matches by assigned property regardless of legacy owner", () => {
    const p1 = makeObjectId("p1");
    const p2 = makeObjectId("p2");
    const scope = {
      filter: { propertyId: { $in: [p1] } },
      userId: CARETAKER_ID,
      role: "caretaker" as Role,
      managedByOwnerId: "",
      propertyScopeIds: [p1],
      assignedPropertyIds: [p1],
    };
    expect(tenantMatchesScope({ ownerId: OTHER_OWNER_ID, propertyId: p1 }, scope)).toBe(true);
    expect(tenantMatchesScope({ ownerId: OWNER_ID, propertyId: p1 }, scope)).toBe(true);
    expect(tenantMatchesScope({ ownerId: OTHER_OWNER_ID, propertyId: p2 }, scope)).toBe(false);
  });

  it("never matches for non-owner/admin/caretaker roles", () => {
    const scope = {
      filter: { ownerId: OWNER_ID },
      userId: makeObjectId("tenant"),
      role: "tenant" as Role,
      managedByOwnerId: "",
    };
    expect(tenantMatchesScope({ ownerId: OWNER_ID, propertyId: makeObjectId("p1") }, scope)).toBe(
      false,
    );
  });
});

const INVOICE_ACTIONS: Action[] = [
  "lease:manage",
  "invoice:read",
  "invoice:manage",
  "invoice:mark-paid",
  "invoice:generate",
  "invoice:read-own",
];

describe("requirePermission — invoicing actions", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("system-admin can perform every invoicing action without a resource", async () => {
    const admin = makeUser({ _id: makeObjectId("admin"), role: "system-admin" });
    for (const action of INVOICE_ACTIONS) {
      expect(await guard(action, undefined, admin)).toBeNull();
    }
  });

  it("owner is denied invoicing actions", async () => {
    for (const action of INVOICE_ACTIONS) {
      expect((await guard(action, undefined, ownerUser()))?.status).toBe(403);
    }
  });

  it("tenant passes through ONLY for invoice:read-own", async () => {
    const t = tenantUser();
    expect(await guard("invoice:read-own", undefined, t)).toBeNull();
    for (const action of INVOICE_ACTIONS) {
      if (action === "invoice:read-own") continue;
      expect((await guard(action, undefined, t))?.status).toBe(403);
    }
  });

  it("C6 — manage_invoices caretaker reads, marks paid and generates with assignment, but never touches leases", async () => {
    const mocker = caretakerUser(["manage_invoices"]);
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: ["invoice:read", "invoice:manage", "invoice:mark-paid", "invoice:generate"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const resource = { propertyId: PROPERTY_ID };
    expect(await guard("invoice:read", { resource }, mocker)).toBeNull();
    expect(await guard("invoice:generate", { resource }, mocker)).toBeNull();
    expect(await guard("invoice:manage", { resource }, mocker)).toBeNull();
    expect(await guard("invoice:mark-paid", { resource }, mocker)).toBeNull();
    expect((await guard("lease:manage", { resource }, mocker))?.status).toBe(403);
    expect((await guard("invoice:read-own", { resource }, mocker))?.status).toBe(403);
  });

  it("C6 — invoice:manage and invoice:mark-paid require an in-scope resource", async () => {
    const mocker = caretakerUser(["manage_invoices"]);
    const inScopeProperty = PROPERTY_ID;
    const foreignProperty = makeObjectId("foreign-property");
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: inScopeProperty,
          permissions: ["invoice:manage", "invoice:mark-paid"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    expect(
      await guard("invoice:manage", { resource: { propertyId: inScopeProperty } }, mocker),
    ).toBeNull();
    expect(
      await guard("invoice:mark-paid", { resource: { propertyId: inScopeProperty } }, mocker),
    ).toBeNull();
    expect(
      (await guard("invoice:manage", { resource: { propertyId: foreignProperty } }, mocker))
        ?.status,
    ).toBe(403);
    expect(
      (await guard("invoice:mark-paid", { resource: { propertyId: foreignProperty } }, mocker))
        ?.status,
    ).toBe(403);
  });

  it("caretaker without manage_invoices is denied every invoicing action", async () => {
    const mocker = caretakerUser(["manage_tenants"]);
    for (const action of INVOICE_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });

  it("orphaned caretaker is denied every invoicing action", async () => {
    const mocker = caretakerUser([], { managedByOwnerId: "" });
    for (const action of INVOICE_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });
});

const NOTIFICATION_SETTINGS_ACTIONS: Action[] = [
  "notification:read-own",
  "notification:manage",
  "settings:read",
  "settings:write",
];

describe("requirePermission — notification & settings actions", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("system-admin passes every notification/settings action", async () => {
    const admin = makeUser({ _id: makeObjectId("admin"), role: "system-admin" });
    for (const action of NOTIFICATION_SETTINGS_ACTIONS) {
      expect(await guard(action, undefined, admin)).toBeNull();
    }
  });

  it("tenant passes own-scope notification reads and settings access", async () => {
    const t = tenantUser();
    for (const action of NOTIFICATION_SETTINGS_ACTIONS) {
      expect(await guard(action, undefined, t)).toBeNull();
    }
    // Sanity: the allow-list does not leak into resource-heavy actions.
    expect((await guard("invoice:read", undefined, t))?.status).toBe(403);
  });

  it("caretaker passes notification/settings actions with an assignment", async () => {
    const mocker = caretakerUser([]);
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: [...NOTIFICATION_SETTINGS_ACTIONS],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    for (const action of NOTIFICATION_SETTINGS_ACTIONS) {
      expect(await guard(action, { resource: { propertyId: PROPERTY_ID } }, mocker)).toBeNull();
    }
  });

  it("caretaker without assignment is denied every notification/settings action", async () => {
    const mocker = caretakerUser([]);
    for (const action of NOTIFICATION_SETTINGS_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });

  it("orphaned caretaker is denied every notification/settings action", async () => {
    const mocker = caretakerUser([], { managedByOwnerId: "" });
    for (const action of NOTIFICATION_SETTINGS_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });
});

const COMMUNICATION_SELF_ACTIONS: Action[] = [
  "complaint:read-own",
  "complaint:create",
  "chat:read-own",
  "chat:send",
  "announcement:read",
  "document:read-own",
];

const COMMUNICATION_MANAGE_ACTIONS: Action[] = [
  "complaint:manage",
  "chat:manage",
  "announcement:manage",
  "document:manage",
];

describe("requirePermission — communication actions", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("tenant passes every own-scope communication action", async () => {
    const t = tenantUser();
    for (const action of COMMUNICATION_SELF_ACTIONS) {
      expect(await guard(action, undefined, t)).toBeNull();
    }
  });

  it("tenant is denied every communication manage action", async () => {
    const t = tenantUser();
    for (const action of COMMUNICATION_MANAGE_ACTIONS) {
      expect((await guard(action, undefined, t))?.status).toBe(403);
    }
  });

  it("system-admin passes every communication action without a resource", async () => {
    const admin = makeUser({ _id: makeObjectId("admin"), role: "system-admin" });
    for (const action of [...COMMUNICATION_SELF_ACTIONS, ...COMMUNICATION_MANAGE_ACTIONS]) {
      expect(await guard(action, undefined, admin)).toBeNull();
    }
  });

  it("owner fails manage actions on a foreign owner's resource", async () => {
    const resource = { ownerId: OTHER_OWNER_ID, caretakerIds: [] };
    for (const action of COMMUNICATION_MANAGE_ACTIONS) {
      expect((await guard(action, { resource }, ownerUser()))?.status).toBe(403);
    }
  });

  it("caretaker passes every own-scope communication action with an assignment", async () => {
    const mocker = caretakerUser([]);
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: [...COMMUNICATION_SELF_ACTIONS],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    for (const action of COMMUNICATION_SELF_ACTIONS) {
      expect(await guard(action, { resource: { propertyId: PROPERTY_ID } }, mocker)).toBeNull();
    }
  });

  it("caretaker without assignment is denied every own-scope communication action", async () => {
    const mocker = caretakerUser([]);
    for (const action of COMMUNICATION_SELF_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });

  it("caretaker manage actions require an assignment covering the resource", async () => {
    const mocker = caretakerUser([]);
    const inScope = PROPERTY_ID;
    const foreign = makeObjectId("foreign-property");
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: inScope,
          permissions: [...COMMUNICATION_MANAGE_ACTIONS],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    for (const action of COMMUNICATION_MANAGE_ACTIONS) {
      expect(await guard(action, { resource: { propertyId: inScope } }, mocker)).toBeNull();
      expect((await guard(action, { resource: { propertyId: foreign } }, mocker))?.status).toBe(
        403,
      );
    }
  });

  it("caretaker manage actions fail without the matching assignment permission", async () => {
    const mocker = caretakerUser([]);
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: [],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    for (const action of COMMUNICATION_MANAGE_ACTIONS) {
      expect((await guard(action, { resource: { propertyId: PROPERTY_ID } }, mocker))?.status).toBe(
        403,
      );
    }
  });

  it("caretaker manage actions fail without the matching privilege", async () => {
    for (const action of COMMUNICATION_MANAGE_ACTIONS) {
      expect((await guard(action, undefined, caretakerUser([])))?.status).toBe(403);
      expect((await guard(action, undefined, caretakerUser(["manage_tenants"])))?.status).toBe(403);
    }
  });

  it("orphaned caretaker is denied every communication action", async () => {
    const mocker = caretakerUser([], { managedByOwnerId: "" });
    for (const action of [...COMMUNICATION_SELF_ACTIONS, ...COMMUNICATION_MANAGE_ACTIONS]) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });
});

describe("requirePermission — custodian", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  function assignment(permissions: string[]) {
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CUSTODIAN_ID,
          accessRole: "custodian",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions,
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
  }

  it("passes resource-free actions without an assignment", async () => {
    expect(await guard("property:create", undefined, custodianUser())).toBeNull();
  });

  it("passes resource-scoped actions with an assignment", async () => {
    assignment([
      "property:edit",
      "property:delete",
      "unit:manage",
      "tenant:manage",
      "move-request:manage",
      "invoice:manage",
      "complaint:manage",
    ]);
    const resource = { propertyId: PROPERTY_ID };
    for (const action of [
      "property:edit",
      "property:delete",
      "unit:manage",
      "tenant:manage",
      "move-request:manage",
      "invoice:manage",
      "complaint:manage",
    ] as Action[]) {
      expect(await guard(action, { resource }, custodianUser())).toBeNull();
    }
  });

  it("is denied resource-scoped actions on a foreign property", async () => {
    assignment(["property:edit", "unit:manage", "invoice:manage"]);
    const foreign = makeObjectId("foreign-property");
    expect(
      (await guard("property:edit", { resource: { propertyId: foreign } }, custodianUser()))
        ?.status,
    ).toBe(403);
    expect(
      (await guard("unit:manage", { resource: { propertyId: foreign } }, custodianUser()))?.status,
    ).toBe(403);
    expect(
      (await guard("invoice:manage", { resource: { propertyId: foreign } }, custodianUser()))
        ?.status,
    ).toBe(403);
  });

  it("is denied resource-scoped actions without an assignment", async () => {
    expect(
      (await guard("property:edit", { resource: { propertyId: PROPERTY_ID } }, custodianUser()))
        ?.status,
    ).toBe(403);
    expect(
      (await guard("unit:manage", { resource: { propertyId: PROPERTY_ID } }, custodianUser()))
        ?.status,
    ).toBe(403);
  });

  it("cannot manage other custodians", async () => {
    expect((await guard("custodian:manage", undefined, custodianUser()))?.status).toBe(403);
  });

  it("system-admin may manage custodians", async () => {
    const admin = makeUser({ _id: makeObjectId("admin"), role: "system-admin" });
    expect(await guard("custodian:manage", undefined, admin)).toBeNull();
  });

  it("owner is denied managing custodians", async () => {
    expect((await guard("custodian:manage", undefined, ownerUser()))?.status).toBe(403);
  });

  it("tenant still cannot manage custodians", async () => {
    expect((await guard("custodian:manage", undefined, tenantUser()))?.status).toBe(403);
  });
});

describe("getTenantScope — custodian", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("scopes to active assignments (no legacy owner binding)", async () => {
    const assignedPropertyId = makeObjectId("custodian-property");
    user.findById.mockReturnValue(buildQuery(custodianUser()));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          accessRole: "custodian",
          scopeType: "property",
          propertyId: assignedPropertyId,
          permissions: ["tenant:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(CUSTODIAN_ID) }),
    );
    expect(res instanceof Response).toBe(false);
    if (res instanceof Response) return;
    expect(res.filter).toEqual({ propertyId: { $in: [assignedPropertyId] } });
    expect(res.role).toBe("custodian");
  });

  it("403 for a custodian without assignments", async () => {
    user.findById.mockReturnValue(buildQuery(custodianUser()));
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(CUSTODIAN_ID) }),
    );
    expect((res as Response).status).toBe(403);
  });

  it("403 for an orphaned custodian", async () => {
    user.findById.mockReturnValue(buildQuery(custodianUser({ managedByOwnerId: "" })));
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(CUSTODIAN_ID) }),
    );
    expect((res as Response).status).toBe(403);
  });
});

describe("getTenantScope — caretaker assignments", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("scopes to active assignments instead of Property.caretakerIds", async () => {
    const assignedPropertyId = makeObjectId("caretaker-property");
    user.findById.mockReturnValue(buildQuery(caretakerUser(["manage_tenants"])));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: assignedPropertyId,
          permissions: ["tenant:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );

    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(CARETAKER_ID) }),
    );
    expect(res instanceof Response).toBe(false);
    if (res instanceof Response) return;
    expect(res.filter).toEqual({ propertyId: { $in: [assignedPropertyId] } });
    expect(res.leaseFilter).toEqual({ propertyId: { $in: [assignedPropertyId] } });
    expect(res.staffAssignmentBacked).toBe(true);
  });
});
