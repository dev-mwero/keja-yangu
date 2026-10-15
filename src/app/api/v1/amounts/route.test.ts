/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import {
  makeInvoice,
  makeLease,
  makeObjectId,
  makeProperty,
  makeUnit,
  makeUser,
  type TestUser,
} from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));

import { GET } from "@/app/api/v1/amounts/route";

const { user, property, unit, invoice, lease } = getModelStubs();

const SELF_ID = makeObjectId("self");
const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("otherowner");
const PROP_ID = makeObjectId("prop1");
const BLOCK_ID = makeObjectId("block1");
const FLOOR_ID = makeObjectId("floor1");

/** A property carrying a floor-level and block-level rent override. */
function propertyWithHierarchy(overrides: Record<string, unknown> = {}) {
  return {
    ...makeProperty({ _id: PROP_ID, ownerId: OWNER_ID }),
    blocks: [
      {
        _id: BLOCK_ID,
        name: "A",
        rentOverride: 20000,
        floors: [{ _id: FLOOR_ID, level: 1, label: "1", unitsPerFloor: 1, rentOverride: 25000 }],
      },
    ],
    ...overrides,
  };
}

function stubReads({
  docs = [] as unknown[],
  units = [] as unknown[],
  invoices = [] as unknown[],
  leases = [] as unknown[],
  invoiceCount = 0,
  periodHistory = [] as unknown[],
} = {}) {
  property.find.mockReturnValue(buildQuery(docs));
  unit.find.mockReturnValue(buildQuery(units));
  invoice.find.mockReturnValue(buildQuery(invoices));
  lease.find.mockReturnValue(buildQuery(leases));
  invoice.countDocuments.mockResolvedValue(invoiceCount);
  invoice.aggregate.mockResolvedValue(periodHistory);
}

function signIn(role: TestUser["role"], overrides: Partial<TestUser> = {}) {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: SELF_ID, role, ...overrides })));
  return signToken(SELF_ID);
}

async function json(res: Response) {
  return (await res.json()) as Record<string, number | string>;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

describe("GET /api/v1/amounts", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/amounts"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a tenant", async () => {
    const token = signIn("tenant");
    const res = await GET(buildRequest("/api/v1/amounts", { token }));
    expect(res.status).toBe(403);
  });

  it("returns the documented response shape", async () => {
    const token = signIn("owner");
    stubReads();

    const body = await json(await GET(buildRequest("/api/v1/amounts", { token })));

    expect(Object.keys(body).sort()).toEqual(
      [
        "byPeriod",
        "contractedRent",
        "invoiceCount",
        "occupiedMonthlyRent",
        "occupiedUnitCount",
        "openInvoiceCount",
        "period",
        "potentialMonthlyRent",
        "rentBilled",
        "rentCollected",
        "rentOutstanding",
        "unitCount",
      ].sort(),
    );
    expect(body.period).toMatch(PERIOD_RE);
  });

  it("forces an owner onto their own portfolio even when ownerId is supplied", async () => {
    const token = signIn("owner");
    stubReads({
      docs: [propertyWithHierarchy()],
      units: [
        makeUnit({
          propertyId: PROP_ID,
          ownerId: SELF_ID,
          floorId: FLOOR_ID,
          blockId: BLOCK_ID,
          rent: 30000,
          status: "occupied",
        }),
        makeUnit({
          propertyId: PROP_ID,
          ownerId: SELF_ID,
          floorId: FLOOR_ID,
          blockId: BLOCK_ID,
          rent: null,
          status: "occupied",
        }),
      ],
      invoices: [
        makeInvoice({ ownerId: SELF_ID, amountDue: 55000, amountPaid: 20000 }),
        makeInvoice({ ownerId: SELF_ID, amountDue: 1000, amountPaid: 0, status: "paid" }),
      ],
      invoiceCount: 2,
      leases: [
        makeLease({ ownerId: SELF_ID, rentAmount: 50000, startDate: new Date("2026-10-01") }),
      ],
    });

    const res = await GET(
      buildRequest("/api/v1/amounts", { token, query: { ownerId: OTHER_OWNER_ID } }),
    );

    expect(res.status).toBe(200);
    // Scope is derived from the session, never the query string.
    expect(unit.find).toHaveBeenCalledWith({ ownerId: SELF_ID });
    expect(invoice.find).toHaveBeenCalledWith({
      ownerId: SELF_ID,
      period: expect.any(String),
      status: { $nin: ["draft", "void"] },
    });

    const body = await json(res);
    // 30000 (own rent) + 25000 (floor override) — not the block's 20000.
    expect(body.potentialMonthlyRent).toBe(55000);
    expect(body.occupiedMonthlyRent).toBe(55000);
    expect(body.contractedRent).toBe(50000);
    expect(body.rentBilled).toBe(56000);
    expect(body.rentCollected).toBe(20000);
    expect(body.rentOutstanding).toBe(36000);
    expect(body.openInvoiceCount).toBe(2);
    expect(body.unitCount).toBe(2);
    expect(body.occupiedUnitCount).toBe(2);
    expect(body.invoiceCount).toBe(2);
  });

  it("summarises per-period history scoped to the caller, excluding drafts and voids", async () => {
    const token = signIn("owner");
    stubReads({
      periodHistory: [
        { _id: "2026-09", billed: 50000, collected: 20000, open: 1, count: 2 },
        { _id: "2026-08", billed: 30000, collected: 30000, open: 0, count: 2 },
      ],
    });

    const body = (await json(await GET(buildRequest("/api/v1/amounts", { token })))) as Record<
      string,
      unknown
    >;

    expect(body.byPeriod).toEqual([
      { period: "2026-09", billed: 50000, collected: 20000, open: 1, count: 2 },
      { period: "2026-08", billed: 30000, collected: 30000, open: 0, count: 2 },
    ]);
    expect(invoice.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        { $match: { ownerId: SELF_ID, status: { $nin: ["draft", "void"] } } },
      ]),
    );
  });

  it("resolves a unit with no rent through the block override", async () => {
    const token = signIn("owner");
    stubReads({
      docs: [
        propertyWithHierarchy({
          blocks: [
            { _id: BLOCK_ID, rentOverride: 20000, floors: [{ _id: FLOOR_ID, rentOverride: null }] },
          ],
        }),
      ],
      units: [makeUnit({ floorId: FLOOR_ID, blockId: BLOCK_ID, rent: null })],
    });

    const body = await json(await GET(buildRequest("/api/v1/amounts", { token })));
    expect(body.potentialMonthlyRent).toBe(20000);
  });

  it("scopes a custodian to the managing owner", async () => {
    const token = signIn("custodian", { managedByOwnerId: OWNER_ID });
    stubReads({
      docs: [propertyWithHierarchy()],
      units: [makeUnit({ ownerId: OWNER_ID, rent: 15000 })],
    });

    const res = await GET(
      buildRequest("/api/v1/amounts", { token, query: { ownerId: OTHER_OWNER_ID } }),
    );

    expect(res.status).toBe(200);
    expect(property.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(unit.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("scopes a caretaker to their assigned properties", async () => {
    const token = signIn("caretaker", {
      managedByOwnerId: OWNER_ID,
      privileges: ["manage_invoices"],
    });
    // resolveInvoiceActor and the route both read Property; the same docs
    // satisfy both queries (one carries `_id`, the other `blocks`).
    stubReads({
      docs: [propertyWithHierarchy()],
      units: [makeUnit({ propertyId: PROP_ID, rent: 18000 })],
    });

    const res = await GET(buildRequest("/api/v1/amounts", { token }));

    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ ownerId: OWNER_ID, propertyId: { $in: [PROP_ID] } });
    expect(invoice.find).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: { $in: [PROP_ID] }, ownerId: OWNER_ID }),
    );

    const body = await json(res);
    expect(body.potentialMonthlyRent).toBe(18000);
  });

  it("returns 403 for a caretaker asking about a property outside their assignment", async () => {
    const token = signIn("caretaker", {
      managedByOwnerId: OWNER_ID,
      privileges: ["manage_invoices"],
    });
    stubReads({ docs: [propertyWithHierarchy()] });

    const res = await GET(
      buildRequest("/api/v1/amounts", {
        token,
        query: { propertyId: makeObjectId("foreign") },
      }),
    );

    expect(res.status).toBe(403);
  });

  it("lets a system-admin scope to an explicit ownerId", async () => {
    const token = signIn("system-admin");
    stubReads({
      docs: [propertyWithHierarchy()],
      units: [makeUnit({ ownerId: OWNER_ID, rent: 40000 })],
    });

    await GET(buildRequest("/api/v1/amounts", { token, query: { ownerId: OWNER_ID } }));

    expect(property.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(unit.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(invoice.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      period: expect.any(String),
      status: { $nin: ["draft", "void"] },
    });
  });

  it("reads platform-wide for a system-admin with no ownerId", async () => {
    const token = signIn("system-admin");
    stubReads({
      units: [makeUnit({ rent: 40000 })],
      invoices: [makeInvoice({ amountDue: 40000 })],
      invoiceCount: 1,
    });

    const body = await json(await GET(buildRequest("/api/v1/amounts", { token })));

    expect(property.find).toHaveBeenCalledWith({});
    expect(unit.find).toHaveBeenCalledWith({});
    expect(body.rentOutstanding).toBe(40000);
  });

  it("honours an explicit period and rejects a malformed one", async () => {
    const token = signIn("owner");
    stubReads();

    await GET(buildRequest("/api/v1/amounts", { token, query: { period: "2026-05" } }));
    expect(invoice.find).toHaveBeenCalledWith({
      ownerId: SELF_ID,
      period: "2026-05",
      status: { $nin: ["draft", "void"] },
    });

    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: SELF_ID, role: "owner" })));
    stubReads();
    const res = await GET(
      buildRequest("/api/v1/amounts", { token, query: { period: "not-a-period" } }),
    );
    expect((await json(res)).period).toMatch(PERIOD_RE);
  });

  it("returns zeros for an empty portfolio", async () => {
    const token = signIn("owner");
    stubReads();

    const body = await json(await GET(buildRequest("/api/v1/amounts", { token })));

    expect(body).toMatchObject({
      potentialMonthlyRent: 0,
      occupiedMonthlyRent: 0,
      contractedRent: 0,
      rentBilled: 0,
      rentCollected: 0,
      rentOutstanding: 0,
      openInvoiceCount: 0,
      unitCount: 0,
      invoiceCount: 0,
      occupiedUnitCount: 0,
    });
    expect(body.byPeriod).toEqual([]);
  });
});
