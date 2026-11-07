/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUnit, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import { GET } from "@/app/api/v1/units/route";

const { user, property, unit, tenant, managementAssignment } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const CARETAKER_ID = makeObjectId("caretaker");
const TENANT_ID = makeObjectId("tenant");

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

function listResult(docs: unknown[]) {
  unit.find.mockReturnValue(buildQuery(docs));
  unit.countDocuments.mockResolvedValue(docs.length);
}

describe("GET /api/v1/units", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/units"));
    expect(res.status).toBe(401);
  });

  it("scopes an owner to their own units", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    listResult([makeUnit({ ownerId: OWNER_ID })]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    const body = await json(res);
    expect(body.data).toHaveLength(1);
  });

  it("scopes an admin to property, block, and unit assignments", async () => {
    const ADMIN_ID = makeObjectId("admin");
    const propertyId = makeObjectId("assigned-property");
    const blockId = makeObjectId("assigned-block");
    const unitId = makeObjectId("assigned-unit");
    const activeAssignment = (scopeType: string, ids: Record<string, string>) => ({
      accessRole: "admin",
      scopeType,
      propertyId: ids.propertyId,
      blockId: ids.blockId ?? "",
      unitId: ids.unitId ?? "",
      permissions: ["unit:read"],
      status: "active",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: null,
    });
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        activeAssignment("property", { propertyId }),
        activeAssignment("block", { propertyId, blockId }),
        activeAssignment("unit", { propertyId, blockId, unitId }),
      ]),
    );
    listResult([]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(ADMIN_ID) }));

    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({
      $or: [
        { propertyId: { $in: [propertyId] } },
        { blockId: { $in: [blockId] } },
        { _id: { $in: [unitId] } },
      ],
    });
  });

  it("scopes a custodian to the managing owner's units", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OWNER_ID })),
    );
    listResult([]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("scopes an assignment-backed custodian to assigned properties", async () => {
    const propertyId = makeObjectId("custodian-property");
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: "" })),
    );
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          accessRole: "custodian",
          scopeType: "property",
          propertyId,
          permissions: ["unit:read"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    listResult([]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ $or: [{ propertyId: { $in: [propertyId] } }] });
  });

  it("403 for an orphaned custodian", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: "" })),
    );
    const res = await GET(buildRequest("/api/v1/units", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(403);
  });

  it("scopes a caretaker to assigned properties of the managing owner", async () => {
    const p1 = makeObjectId("p1");
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CARETAKER_ID, role: "caretaker", managedByOwnerId: OWNER_ID })),
    );
    property.find.mockReturnValue(buildQuery([{ _id: p1 }]));
    listResult([]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ ownerId: OWNER_ID, propertyId: { $in: [p1] } });
  });

  it("403 when a caretaker requests units for an unassigned property", async () => {
    const assignedPropertyId = makeObjectId("assigned-property");
    const otherPropertyId = makeObjectId("other-property");
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CARETAKER_ID, role: "caretaker", managedByOwnerId: OWNER_ID })),
    );
    property.find.mockReturnValue(buildQuery([{ _id: assignedPropertyId }]));
    listResult([]);

    const res = await GET(
      buildRequest(`/api/v1/units?propertyId=${otherPropertyId}`, {
        token: signToken(CARETAKER_ID),
      }),
    );

    expect(res.status).toBe(403);
    expect(unit.find).not.toHaveBeenCalled();
  });

  it("scopes a tenant to units at their tenancy's property", async () => {
    const PROP_ID = makeObjectId("prop");
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: TENANT_ID, role: "tenant", email: "t@keja.co" })),
    );
    tenant.find.mockReturnValue(buildQuery([{ propertyId: PROP_ID }]));
    listResult([]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(200);
    expect(tenant.find).toHaveBeenCalledWith({
      $or: [{ userId: TENANT_ID }, { email: "t@keja.co" }],
      deletedAt: null,
    });
    expect(unit.find).toHaveBeenCalledWith({ propertyId: { $in: [PROP_ID] } });
  });

  it("returns an empty list when a tenant has no tenancy", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: TENANT_ID, role: "tenant", email: "t@keja.co" })),
    );
    tenant.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).not.toHaveBeenCalled();
    expect((await json(res)).data).toEqual([]);
  });

  it("403 when a tenant requests units for a foreign property", async () => {
    const OWN_PROP = makeObjectId("own");
    const OTHER_PROP = makeObjectId("other");
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: TENANT_ID, role: "tenant", email: "t@keja.co" })),
    );
    tenant.find.mockReturnValue(buildQuery([{ propertyId: OWN_PROP }]));

    const res = await GET(
      buildRequest(`/api/v1/units?propertyId=${OTHER_PROP}`, { token: signToken(TENANT_ID) }),
    );
    expect(res.status).toBe(403);
    expect(unit.find).not.toHaveBeenCalled();
  });
});
