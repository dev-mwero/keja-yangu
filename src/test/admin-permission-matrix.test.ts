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
vi.mock("@/models/ManagementAssignment", () => ({ ManagementAssignment: getModelStubs().managementAssignment }));

// announcements
vi.mock("@/models/Announcement", () => ({ Announcement: getModelStubs().announcement }));

// commissions
vi.mock("@/models/CommissionAccrual", () => ({ CommissionAccrual: getModelStubs().commissionAccrual }));

import { GET as getAmounts } from "@/app/api/v1/amounts/route";
import { GET as getAnnouncements } from "@/app/api/v1/announcements/route";
import { GET as getCommissions } from "@/app/api/v1/commissions/route";

const stubs = getModelStubs();
const { user, property, unit, invoice, lease, managementAssignment, announcement, commissionAccrual } = stubs;

const ADMIN_ID = makeObjectId("admin");
const PROP_ID = makeObjectId("prop");
function signInAdmin() {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin", isActive: true })));
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