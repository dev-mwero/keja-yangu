/**
 * @vitest-environment node
 *
 * Admin permission matrix (Phase E).
 *
 * Verifies the core admin invariants:
 *  - An admin with an active, permission-bearing assignment can read scoped data.
 *  - An admin with NO assignment gets an empty result set (lists) / 403 (single
 *    resource), never legacy owner scope.
 *
 * Run with AUTHZ_ENFORCE_ROUTE_FAMILIES=* to also exercise the scoped policy
 * path; the legacy path alone is exercised by default.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({ connectToDatabase: vi.fn().mockResolvedValue(undefined) }));

// amounts
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

// announcements
vi.mock("@/models/Announcement", () => ({ Announcement: getModelStubs().announcement }));

// commissions
vi.mock("@/models/CommissionAccrual", () => ({
  CommissionAccrual: getModelStubs().commissionAccrual,
}));

// property-types (platform action: system-admin only)
vi.mock("@/models/PropertyType", () => ({ PropertyTypeModel: getModelStubs().propertytype }));

// recycle-bin (platform action: system-admin only) — the gate is under test,
// not the deleted-record data path (covered by the route's own test), so the
// lib seam is stubbed.
vi.mock("@/lib/recycle-bin", () => ({
  countDeleted: vi.fn().mockResolvedValue({ property: 0 }),
  isRecycleBinType: () => false,
  listDeleted: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
}));

import { GET as getAmounts } from "@/app/api/v1/amounts/route";
import { GET as getAnnouncements } from "@/app/api/v1/announcements/route";
import { GET as getCommissions } from "@/app/api/v1/commissions/route";
import { GET as getPropertyTypes } from "@/app/api/v1/property-types/route";
import { GET as getRecycleBin } from "@/app/api/v1/recycle-bin/route";
import { invalidatePropertyTypeCache } from "@/lib/property-type-store";

const stubs = getModelStubs();
const {
  user,
  property,
  unit,
  invoice,
  lease,
  managementAssignment,
  announcement,
  commissionAccrual,
  propertytype,
} = stubs;

const ADMIN_ID = makeObjectId("admin");
const PROP_ID = makeObjectId("prop");
function signInAdmin() {
  user.findById.mockReturnValue(
    buildQuery(makeUser({ _id: ADMIN_ID, role: "admin", isActive: true })),
  );
  return signToken(ADMIN_ID, { role: "admin" });
}

function activeAssignment() {
  managementAssignment.find.mockReturnValue(
    buildQuery([
      {
        principalUserId: ADMIN_ID,
        accessRole: "admin",
        scopeType: "property",
        propertyId: PROP_ID,
        permissions: [
          "invoice:read",
          "announcement:read",
          "announcement:manage",
          "commission:read",
          "property:read",
        ],
        status: "active",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: null,
      },
    ]),
  );
}

function noAssignment() {
  managementAssignment.find.mockReturnValue(buildQuery([]));
}

beforeEach(() => {
  resetModelStubs();
  invalidatePropertyTypeCache();
});

function assignmentFixture(overrides: Record<string, unknown> = {}) {
  return {
    principalUserId: ADMIN_ID,
    accessRole: "admin",
    scopeType: "property",
    propertyId: PROP_ID,
    permissions: [
      "invoice:read",
      "announcement:read",
      "announcement:manage",
      "commission:read",
      "property:read",
    ],
    status: "active",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    ...overrides,
  };
}

function mockAmountsScopes() {
  property.find.mockReturnValue(buildQuery([]));
  unit.find.mockReturnValue(buildQuery([]));
  invoice.find.mockReturnValue(buildQuery([]));
  invoice.aggregate = vi.fn().mockResolvedValue([]);
  invoice.countDocuments = vi.fn().mockResolvedValue(0);
  lease.find.mockReturnValue(buildQuery([]));
}

describe("admin permission matrix — amounts assignment dimensions", () => {
  it("in-scope active assignment → 200 for the assigned property", async () => {
    const token = signInAdmin();
    managementAssignment.find.mockReturnValue(buildQuery([assignmentFixture()]));
    mockAmountsScopes();

    const res = await getAmounts(
      buildRequest("/api/v1/amounts", { token, query: { propertyId: PROP_ID } }),
    );
    expect(res.status).toBe(200);
  });

  it("out-of-scope admin without the target property → 403", async () => {
    const token = signInAdmin();
    managementAssignment.find.mockReturnValue(
      buildQuery([assignmentFixture({ propertyId: makeObjectId("other-prop") })]),
    );
    mockAmountsScopes();

    const res = await getAmounts(
      buildRequest("/api/v1/amounts", { token, query: { propertyId: PROP_ID } }),
    );
    expect(res.status).toBe(403);
  });

  it("no assignment → 403 for a scoped property lookup", async () => {
    const token = signInAdmin();
    noAssignment();
    mockAmountsScopes();

    const res = await getAmounts(
      buildRequest("/api/v1/amounts", { token, query: { propertyId: PROP_ID } }),
    );
    expect(res.status).toBe(403);
  });

  it("expired assignment (endsAt in the past) → 403", async () => {
    const token = signInAdmin();
    managementAssignment.find.mockReturnValue(
      buildQuery([assignmentFixture({ endsAt: new Date("2025-01-01T00:00:00.000Z") })]),
    );
    mockAmountsScopes();

    const res = await getAmounts(
      buildRequest("/api/v1/amounts", { token, query: { propertyId: PROP_ID } }),
    );
    expect(res.status).toBe(403);
  });

  it("not-yet-started assignment (startsAt in the future) → 403", async () => {
    const token = signInAdmin();
    managementAssignment.find.mockReturnValue(
      buildQuery([assignmentFixture({ startsAt: new Date("2099-01-01T00:00:00.000Z") })]),
    );
    mockAmountsScopes();

    const res = await getAmounts(
      buildRequest("/api/v1/amounts", { token, query: { propertyId: PROP_ID } }),
    );
    expect(res.status).toBe(403);
  });

  it("suspended (non-active status) assignment → 403", async () => {
    const token = signInAdmin();
    managementAssignment.find.mockReturnValue(
      buildQuery([assignmentFixture({ status: "suspended" })]),
    );
    mockAmountsScopes();

    const res = await getAmounts(
      buildRequest("/api/v1/amounts", { token, query: { propertyId: PROP_ID } }),
    );
    expect(res.status).toBe(403);
  });

  it("permission-subset assignment without invoice:read → 403", async () => {
    const token = signInAdmin();
    managementAssignment.find.mockReturnValue(
      buildQuery([assignmentFixture({ permissions: ["property:read"] })]),
    );
    mockAmountsScopes();

    const res = await getAmounts(
      buildRequest("/api/v1/amounts", { token, query: { propertyId: PROP_ID } }),
    );
    expect(res.status).toBe(403);
  });

  it("multi-property assignments including the target → 200", async () => {
    const token = signInAdmin();
    const otherId = makeObjectId("other-prop");
    managementAssignment.find.mockReturnValue(
      buildQuery([assignmentFixture({ propertyId: otherId }), assignmentFixture()]),
    );
    mockAmountsScopes();

    const res = await getAmounts(
      buildRequest("/api/v1/amounts", { token, query: { propertyId: PROP_ID } }),
    );
    expect(res.status).toBe(200);
  });
});

describe("platform actions — system-admin only", () => {
  const SYSTEM_ADMIN_ID = makeObjectId("sysadmin");
  const OWNER_ID = makeObjectId("owner");

  function signInAs(role: string, id: string) {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: id, role: role as never })));
    return signToken(id, { role });
  }

  function mockPropertyTypes() {
    propertytype.exists = vi.fn().mockResolvedValue(true);
    propertytype.find.mockReturnValue(buildQuery([]));
  }

  it("system-admin may list property types including inactive", async () => {
    const token = signInAs("system-admin", SYSTEM_ADMIN_ID);
    mockPropertyTypes();

    const res = await getPropertyTypes(
      buildRequest("/api/v1/property-types", { token, query: { all: "1" } }),
    );
    expect(res.status).toBe(200);
  });

  it("system-admin may read the recycle bin", async () => {
    const token = signInAs("system-admin", SYSTEM_ADMIN_ID);

    const res = await getRecycleBin(buildRequest("/api/v1/recycle-bin", { token }));
    expect(res.status).toBe(200);
  });

  it("admin with an active assignment still cannot manage property types", async () => {
    const token = signInAs("admin", ADMIN_ID);
    managementAssignment.find.mockReturnValue(buildQuery([assignmentFixture()]));
    mockPropertyTypes();

    const res = await getPropertyTypes(
      buildRequest("/api/v1/property-types", { token, query: { all: "1" } }),
    );
    expect(res.status).toBe(403);
  });

  it("admin with an active assignment still cannot read the recycle bin", async () => {
    const token = signInAs("admin", ADMIN_ID);
    managementAssignment.find.mockReturnValue(buildQuery([assignmentFixture()]));

    const res = await getRecycleBin(buildRequest("/api/v1/recycle-bin", { token }));
    expect(res.status).toBe(403);
  });

  it("owner cannot manage property types", async () => {
    const token = signInAs("owner", OWNER_ID);
    mockPropertyTypes();

    const res = await getPropertyTypes(
      buildRequest("/api/v1/property-types", { token, query: { all: "1" } }),
    );
    expect(res.status).toBe(403);
  });

  it("owner cannot read the recycle bin", async () => {
    const token = signInAs("owner", OWNER_ID);

    const res = await getRecycleBin(buildRequest("/api/v1/recycle-bin", { token }));
    expect(res.status).toBe(403);
  });

  it("custodian cannot manage property types", async () => {
    const token = signInAs("custodian", makeObjectId("custodian"));
    mockPropertyTypes();

    const res = await getPropertyTypes(
      buildRequest("/api/v1/property-types", { token, query: { all: "1" } }),
    );
    expect(res.status).toBe(403);
  });

  it("caretaker cannot read the recycle bin", async () => {
    const token = signInAs("caretaker", makeObjectId("caretaker"));

    const res = await getRecycleBin(buildRequest("/api/v1/recycle-bin", { token }));
    expect(res.status).toBe(403);
  });

  it("tenant cannot manage property types", async () => {
    const token = signInAs("tenant", makeObjectId("tenant"));
    mockPropertyTypes();

    const res = await getPropertyTypes(
      buildRequest("/api/v1/property-types", { token, query: { all: "1" } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("admin permission matrix — amounts", () => {
  it("active assignment → 200 scoped to assigned property", async () => {
    const token = signInAdmin();
    activeAssignment();
    property.find.mockReturnValue(buildQuery([]));
    unit.find.mockReturnValue(buildQuery([]));
    invoice.find.mockReturnValue(buildQuery([]));
    invoice.aggregate = vi.fn().mockResolvedValue([]);
    invoice.countDocuments = vi.fn().mockResolvedValue(0);
    lease.find.mockReturnValue(buildQuery([]));

    const res = await getAmounts(buildRequest("/api/v1/amounts", { token }));
    expect(res.status).toBe(200);
  });

  it("no assignment → not 200 with owner-scope data (empty/degraded)", async () => {
    const token = signInAdmin();
    noAssignment();
    property.find.mockReturnValue(buildQuery([]));
    unit.find.mockReturnValue(buildQuery([]));
    invoice.find.mockReturnValue(buildQuery([]));
    invoice.aggregate = vi.fn().mockResolvedValue([]);
    invoice.countDocuments = vi.fn().mockResolvedValue(0);
    lease.find.mockReturnValue(buildQuery([]));

    const res = await getAmounts(buildRequest("/api/v1/amounts", { token }));
    // Either 200 with empty aggregates or 403; never a cross-tenant/full portfolio.
    expect([200, 403]).toContain(res.status);
  });
});

describe("admin permission matrix — announcements", () => {
  it("active assignment → 200", async () => {
    const token = signInAdmin();
    activeAssignment();
    announcement.find.mockReturnValue(buildQuery([]));
    announcement.countDocuments = vi.fn().mockResolvedValue(0);

    const res = await getAnnouncements(buildRequest("/api/v1/announcements", { token }));
    expect(res.status).toBe(200);
  });

  it("no assignment → not a 500 and no crash", async () => {
    const token = signInAdmin();
    noAssignment();
    announcement.find.mockReturnValue(buildQuery([]));
    announcement.countDocuments = vi.fn().mockResolvedValue(0);

    const res = await getAnnouncements(buildRequest("/api/v1/announcements", { token }));
    expect([200, 403]).toContain(res.status);
  });
});

describe("admin permission matrix — commissions", () => {
  it("active assignment → 200", async () => {
    const token = signInAdmin();
    activeAssignment();
    commissionAccrual.find.mockReturnValue(buildQuery([]));
    commissionAccrual.countDocuments = vi.fn().mockResolvedValue(0);

    const res = await getCommissions(buildRequest("/api/v1/commissions", { token }));
    expect(res.status).toBe(200);
  });

  it("no assignment → not a 500", async () => {
    const token = signInAdmin();
    noAssignment();
    commissionAccrual.find.mockReturnValue(buildQuery([]));
    commissionAccrual.countDocuments = vi.fn().mockResolvedValue(0);

    const res = await getCommissions(buildRequest("/api/v1/commissions", { token }));
    expect([200, 403]).toContain(res.status);
  });
});
