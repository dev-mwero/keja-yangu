/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action, CaretakerPrivilege, Role } from "@/lib/permissions";
import {
  getTenantScope,
  isFullControlRole,
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

const { user, property } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const OTHER_OWNER_ID = makeObjectId("other-owner");

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

async function guard(
  action: Action,
  opts: { resource?: { ownerId?: string; caretakerIds?: string[] } } | undefined,
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
  it("returns true for owner and system-admin", () => {
    expect(isFullControlRole("owner")).toBe(true);
    expect(isFullControlRole("system-admin")).toBe(true);
  });

  it("returns false for caretaker and tenant", () => {
    expect(isFullControlRole("caretaker")).toBe(false);
    expect(isFullControlRole("tenant")).toBe(false);
  });
});

describe("requirePermission — authentication failure modes", () => {
  beforeEach(() => {
    resetModelStubs();
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
});

describe("requirePermission — owner", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("allows every action without a resource", async () => {
    for (const action of ALL_ACTIONS) {
      expect(await guard(action, undefined, ownerUser())).toBeNull();
    }
  });

  it("allows edit/delete of own property", async () => {
    const resource = { ownerId: OWNER_ID, caretakerIds: [] };
    expect(await guard("property:edit", { resource }, ownerUser())).toBeNull();
    expect(await guard("property:delete", { resource }, ownerUser())).toBeNull();
  });

  it("403 for edit/delete of a foreign owner's property", async () => {
    const resource = { ownerId: OTHER_OWNER_ID, caretakerIds: [] };
    expect((await guard("property:edit", { resource }, ownerUser()))?.status).toBe(403);
    expect((await guard("property:delete", { resource }, ownerUser()))?.status).toBe(403);
  });

  it("allows tenant:manage with no resource restraint", async () => {
    expect(await guard("tenant:manage", undefined, ownerUser())).toBeNull();
  });
});

describe("requirePermission — caretaker", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for all actions when the caretaker is orphaned (no managedByOwnerId)", async () => {
    const mocker = caretakerUser([], { managedByOwnerId: "" });
    for (const action of ALL_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });

  it("403 for all actions when the caretaker has no privileges (C0)", async () => {
    const mocker = caretakerUser([]);
    for (const action of ALL_ACTIONS) {
      expect((await guard(action, undefined, mocker))?.status).toBe(403);
    }
  });

  it("C1 — create_property permits property:create only", async () => {
    const mocker = caretakerUser(["create_property"]);
    expect(await guard("property:create", undefined, mocker)).toBeNull();
    expect((await guard("property:edit", undefined, mocker))?.status).toBe(403);
    expect((await guard("property:delete", undefined, mocker))?.status).toBe(403);
    expect((await guard("tenant:manage", undefined, mocker))?.status).toBe(403);
  });

  it("C2 — edit_property permits in-scope edit without assignment", async () => {
    const mocker = caretakerUser(["edit_property"]);
    // Intentional asymmetry: assignment is NOT required for edit, only owner scope.
    const unassigned = { ownerId: OTHER_OWNER_ID, caretakerIds: [] };
    expect(await guard("property:edit", { resource: unassigned }, mocker)).toBeNull();
    expect((await guard("property:create", undefined, mocker))?.status).toBe(403);
    expect((await guard("tenant:manage", undefined, mocker))?.status).toBe(403);
  });

  it("C2 — edit_property rejects out-of-scope edit", async () => {
    const mocker = caretakerUser(["edit_property"]);
    const foreign = { ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] };
    expect((await guard("property:edit", { resource: foreign }, mocker))?.status).toBe(403);
  });

  it("C3 — delete_assigned_property requires assignment AND owner scope", async () => {
    const mocker = caretakerUser(["delete_assigned_property"]);
    const assigned = { ownerId: OTHER_OWNER_ID, caretakerIds: [CARETAKER_ID] };
    expect(await guard("property:delete", { resource: assigned }, mocker)).toBeNull();

    const notAssigned = { ownerId: OTHER_OWNER_ID, caretakerIds: [] };
    expect((await guard("property:delete", { resource: notAssigned }, mocker))?.status).toBe(403);

    const wrongOwner = { ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] };
    expect((await guard("property:delete", { resource: wrongOwner }, mocker))?.status).toBe(403);
  });

  it("C4 — manage_tenants permits tenant:manage only", async () => {
    const mocker = caretakerUser(["manage_tenants"]);
    expect(await guard("tenant:manage", undefined, mocker)).toBeNull();
    expect((await guard("property:create", undefined, mocker))?.status).toBe(403);
    expect((await guard("property:edit", undefined, mocker))?.status).toBe(403);
    expect((await guard("property:delete", undefined, mocker))?.status).toBe(403);
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

  it("owner scope filters by own id", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(OWNER_ID) }),
    );
    expect(res instanceof Response).toBe(false);
    if (res instanceof Response) return;
    expect(res.filter).toEqual({ ownerId: OWNER_ID });
    expect(res.userId).toBe(OWNER_ID);
    expect(res.role).toBe("owner");
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

  it("caretaker scope is limited to assigned properties of the managing owner", async () => {
    const p1 = makeObjectId("p1");
    const p2 = makeObjectId("p2");
    user.findById.mockReturnValue(buildQuery(caretakerUser(["manage_tenants"])));
    property.find.mockReturnValue(buildQuery([{ _id: p1 }, { _id: p2 }]));
    const res = await getTenantScope(
      buildRequest("/api/v1/tenants", { token: signToken(CARETAKER_ID) }),
    );
    expect(res instanceof Response).toBe(false);
    if (res instanceof Response) return;
    expect(res.filter).toEqual({
      propertyId: { $in: [p1, p2] },
      ownerId: OTHER_OWNER_ID,
    });
    expect(res.assignedPropertyIds).toEqual([p1, p2]);
    expect(property.find).toHaveBeenCalledWith({ caretakerIds: CARETAKER_ID });
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
  it("owner matches only own tenants", () => {
    const scope = {
      filter: { ownerId: OWNER_ID },
      userId: OWNER_ID,
      role: "owner" as Role,
      managedByOwnerId: "",
    };
    expect(tenantMatchesScope({ ownerId: OWNER_ID, propertyId: makeObjectId("p1") }, scope)).toBe(
      true,
    );
    expect(
      tenantMatchesScope({ ownerId: OTHER_OWNER_ID, propertyId: makeObjectId("p1") }, scope),
    ).toBe(false);
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

  it("caretaker matches only managing owner's assigned properties", () => {
    const p1 = makeObjectId("p1");
    const p2 = makeObjectId("p2");
    const scope = {
      filter: { propertyId: { $in: [p1] }, ownerId: OTHER_OWNER_ID },
      userId: CARETAKER_ID,
      role: "caretaker" as Role,
      managedByOwnerId: OTHER_OWNER_ID,
      assignedPropertyIds: [p1],
    };
    expect(tenantMatchesScope({ ownerId: OTHER_OWNER_ID, propertyId: p1 }, scope)).toBe(true);
    // assigned to the caretaker but wrong owner
    expect(tenantMatchesScope({ ownerId: OWNER_ID, propertyId: p1 }, scope)).toBe(false);
    // right owner but not an assigned property
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

  it("owner can perform every invoicing action without a resource", async () => {
    for (const action of INVOICE_ACTIONS) {
      expect(await guard(action, undefined, ownerUser())).toBeNull();
    }
  });

  it("owner can manage and mark-paid their own lease/invoice resources", async () => {
    const own = { ownerId: OWNER_ID, caretakerIds: [] };
    expect(await guard("lease:manage", { resource: own }, ownerUser())).toBeNull();
    expect(await guard("invoice:manage", { resource: own }, ownerUser())).toBeNull();
    expect(await guard("invoice:mark-paid", { resource: own }, ownerUser())).toBeNull();
  });

  it("owner is denied lease/invoice mutations on a foreign owner's resource", async () => {
    const foreign = { ownerId: OTHER_OWNER_ID, caretakerIds: [] };
    expect((await guard("lease:manage", { resource: foreign }, ownerUser()))?.status).toBe(403);
    expect((await guard("invoice:manage", { resource: foreign }, ownerUser()))?.status).toBe(403);
    expect((await guard("invoice:mark-paid", { resource: foreign }, ownerUser()))?.status).toBe(
      403,
    );
  });

  it("tenant passes through ONLY for invoice:read-own", async () => {
    const t = tenantUser();
    expect(await guard("invoice:read-own", undefined, t)).toBeNull();
    for (const action of INVOICE_ACTIONS) {
      if (action === "invoice:read-own") continue;
      expect((await guard(action, undefined, t))?.status).toBe(403);
    }
  });

  it("C6 — manage_invoices caretaker reads, marks paid and generates, but never touches leases", async () => {
    const mocker = caretakerUser(["manage_invoices"]);
    expect(await guard("invoice:read", undefined, mocker)).toBeNull();
    expect(await guard("invoice:generate", undefined, mocker)).toBeNull();
    expect((await guard("lease:manage", undefined, mocker))?.status).toBe(403);
    expect((await guard("invoice:read-own", undefined, mocker))?.status).toBe(403);
  });

  it("C6 — invoice:manage and invoice:mark-paid require an in-scope resource", async () => {
    const mocker = caretakerUser(["manage_invoices"]);
    const inScope = { ownerId: OTHER_OWNER_ID, caretakerIds: [CARETAKER_ID] };
    const foreign = { ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] };
    expect(await guard("invoice:manage", { resource: inScope }, mocker)).toBeNull();
    expect(await guard("invoice:mark-paid", { resource: inScope }, mocker)).toBeNull();
    expect((await guard("invoice:manage", { resource: foreign }, mocker))?.status).toBe(403);
    expect((await guard("invoice:mark-paid", { resource: foreign }, mocker))?.status).toBe(403);
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
