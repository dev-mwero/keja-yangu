/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));

import { DELETE, GET, PATCH } from "@/app/api/v1/properties/[id]/route";

const { user, property, tenant, unit } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const PROPERTY_ID = makeObjectId("p1");
const INVALID_ID = "not-a-valid-objectid";

function ownerDoc(overrides: Partial<ReturnType<typeof makeUser>> = {}) {
  return makeUser({ _id: OWNER_ID, role: "owner", ...overrides });
}

function caretakerDoc(privileges: string[], overrides: Partial<ReturnType<typeof makeUser>> = {}) {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OTHER_OWNER_ID,
    privileges: privileges as ReturnType<typeof makeUser>["privileges"],
    ...overrides,
  });
}

function ownProperty() {
  return makeProperty({
    _id: PROPERTY_ID,
    ownerId: OWNER_ID,
    createdById: OWNER_ID,
    caretakerIds: [CARETAKER_ID],
  });
}

function managedProperty() {
  return makeProperty({
    _id: PROPERTY_ID,
    ownerId: OTHER_OWNER_ID,
    createdById: OTHER_OWNER_ID,
    caretakerIds: [CARETAKER_ID],
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/properties/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
    unit.find.mockReturnValue(buildQuery([]));
  });

  it("400 for an invalid id", async () => {
    const res = await GET(buildRequest(`/api/v1/properties/${INVALID_ID}`), withParams(INVALID_ID));
    expect(res.status).toBe(400);
    expect(property.findById).not.toHaveBeenCalled();
  });

  it("404 when absent", async () => {
    property.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
  });

  it("404 when anonymous and the property is not available", async () => {
    property.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
    expect(property.findOne).toHaveBeenCalledWith({
      _id: PROPERTY_ID,
      status: "available",
      published: true,
    });
  });

  it("404 for anonymous when the property is unpublished", async () => {
    property.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
    expect(property.findOne).toHaveBeenCalledWith({
      _id: PROPERTY_ID,
      status: "available",
      published: true,
    });
  });

  it("200 for anonymous when the property is available, with the public projection", async () => {
    const chain = buildQuery(makeProperty({ _id: PROPERTY_ID, status: "available" }));
    property.findOne.mockReturnValue(chain);
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    expect(chain.select).toHaveBeenCalledWith("-ownerId -caretakerIds -createdById -__v");
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("available");
  });

  it("200 with the full doc for an authenticated owner on their own property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findOne.mockReturnValue(buildQuery(ownProperty()));
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, { token: signToken(OWNER_ID) }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    expect(property.findOne).toHaveBeenCalledWith(expect.objectContaining({ ownerId: OWNER_ID }));
    const body = await json(res);
    expect((body.data as { ownerId?: string }).ownerId).toBe(OWNER_ID);
  });

  it("404 for an authenticated user with no scope on a non-available foreign property", async () => {
    const tenantActor = makeUser({ _id: makeObjectId("tenant"), role: "tenant" });
    user.findById.mockReturnValue(buildQuery(tenantActor));
    property.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, { token: signToken(tenantActor._id) }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
    expect(property.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: PROPERTY_ID, status: "available", published: true }),
    );
  });

  it("200 with only the public projection for an authenticated user on an available foreign property", async () => {
    const tenantActor = makeUser({ _id: makeObjectId("tenant"), role: "tenant" });
    user.findById.mockReturnValue(buildQuery(tenantActor));
    const chain = buildQuery(
      makeProperty({ _id: PROPERTY_ID, ownerId: OTHER_OWNER_ID, status: "available" }),
    );
    property.findOne.mockReturnValue(chain);
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, { token: signToken(tenantActor._id) }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    expect(chain.select).toHaveBeenCalledWith("-ownerId -caretakerIds -createdById -__v");
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("available");
  });

  it("404 for a foreign owner on another owner's property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, { token: signToken(OWNER_ID) }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
    expect(property.findOne).toHaveBeenCalledWith(expect.objectContaining({ ownerId: OWNER_ID }));
  });

  it("404 for a caretaker on a property they are not assigned to", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc([])));
    property.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, { token: signToken(CARETAKER_ID) }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
    expect(property.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ caretakerIds: CARETAKER_ID }),
    );
  });

  it("embeds only available units under a safe projection for anonymous", async () => {
    property.findOne.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, status: "available" })),
    );
    unit.find.mockReturnValue(
      buildQuery([
        { _id: makeObjectId("u1"), name: "3A", status: "available", tenantId: "leak" },
        { _id: makeObjectId("u2"), name: "3B", status: "available", tenantId: "" },
      ]),
    );

    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      status: "available",
    });
    const unitChain = unit.find.mock.results[0].value as { select: ReturnType<typeof vi.fn> };
    const projection = unitChain.select.mock.calls[0][0] as string;
    expect(projection).not.toContain("tenantId");
    expect(projection).not.toContain("ownerId");

    const body = await json(res);
    const data = body.data as { units?: Array<{ name?: string }> };
    expect(data.units?.map((u) => u.name)).toEqual(["3A", "3B"]);
  });

  it("embeds no occupied units", async () => {
    property.findOne.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, status: "available" })),
    );
    unit.find.mockReturnValue(buildQuery([]));

    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      status: "available",
    });
  });
});

describe("PATCH /api/v1/properties/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid id", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/properties/${INVALID_ID}`, { method: "PATCH", body: { title: "X" } }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 when absent", async () => {
    property.findById.mockReturnValue(buildQuery(null));
    const res = await PATCH(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, { method: "PATCH", body: { title: "X" } }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
  });

  it("owner can edit own property but identity fields cannot be mutated", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownProperty()));
    const updated = { ...ownProperty(), title: "Renamed" };
    property.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: {
          title: "Renamed",
          ownerId: makeObjectId("spoof"),
          createdById: makeObjectId("spoof"),
          caretakerIds: [CARETAKER_ID],
        },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    const updateArgs = property.findOneAndUpdate.mock.calls[0];
    const updateData = updateArgs[1] as Record<string, unknown>;
    expect(updateData.title).toBe("Renamed");
    expect(updateData.ownerId).toBeUndefined();
    expect(updateData.createdById).toBeUndefined();

    const body = await json(res);
    expect((body.data as { ownerId?: string }).ownerId).toBe(OWNER_ID);
    expect((body.data as { createdById?: string }).createdById).toBe(OWNER_ID);
  });

  it("owner can update caretakerIds (full-control role)", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownProperty()));
    property.findOneAndUpdate.mockReturnValue(buildQuery(ownProperty()));

    const res = await PATCH(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { caretakerIds: [CARETAKER_ID] },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    const updateData = property.findOneAndUpdate.mock.calls[0][1] as { caretakerIds?: string[] };
    expect(updateData.caretakerIds).toEqual([CARETAKER_ID]);
  });

  it("owner can update purpose and dateCompleted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownProperty()));
    const updated = {
      ...ownProperty(),
      purpose: "commercial",
      dateCompleted: new Date("2025-01-01"),
    };
    property.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { purpose: "commercial", dateCompleted: "2025-01-01" },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    const updateData = property.findOneAndUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(updateData.purpose).toBe("commercial");
    expect(updateData.dateCompleted).toEqual(new Date("2025-01-01"));
  });

  it("403 for owner editing a foreign property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await PATCH(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { title: "X" },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
  });

  it("caretaker C2 can edit an in-scope property but caretakerIds are stripped", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["edit_property"])));
    property.findById.mockReturnValue(buildQuery(managedProperty()));
    const updated = { ...managedProperty(), title: "Caretaker edit" };
    property.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PATCH(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PATCH",
        token: signToken(CARETAKER_ID),
        body: { title: "Caretaker edit", caretakerIds: [OWNER_ID] },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    const updateData = property.findOneAndUpdate.mock.calls[0][1] as {
      title?: string;
      caretakerIds?: string[];
    };
    expect(updateData.title).toBe("Caretaker edit");
    expect(updateData.caretakerIds).toBeUndefined();
  });

  it("403 for caretaker C2 on a foreign-owner property", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["edit_property"])));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    const res = await PATCH(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PATCH",
        token: signToken(CARETAKER_ID),
        body: { title: "X" },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 for caretaker C0", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc([])));
    property.findById.mockReturnValue(buildQuery(ownProperty()));
    const res = await PATCH(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PATCH",
        token: signToken(CARETAKER_ID),
        body: { title: "X" },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/v1/properties/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid id", async () => {
    const res = await DELETE(
      buildRequest(`/api/v1/properties/${INVALID_ID}`, { method: "DELETE" }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 when absent", async () => {
    property.findById.mockReturnValue(buildQuery(null));
    const res = await DELETE(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, { method: "DELETE" }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
  });

  it("owner soft-deletes their own property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownProperty()));
    tenant.exists.mockResolvedValue(null);
    property.softDeleteById.mockResolvedValue({ acknowledged: true });
    unit.softDeleteMany.mockResolvedValue({ acknowledged: true });

    const res = await DELETE(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
    expect(tenant.exists).toHaveBeenCalledWith({ propertyId: PROPERTY_ID });
    expect(property.softDeleteById).toHaveBeenCalledWith(PROPERTY_ID);
    expect(unit.softDeleteMany).toHaveBeenCalledWith({ propertyId: PROPERTY_ID });
  });

  it("403 for owner deleting a foreign property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await DELETE(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
    expect(property.softDeleteById).not.toHaveBeenCalled();
  });

  it("caretaker C3 can delete a property they are assigned to when in-scope", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["delete_assigned_property"])));
    property.findById.mockReturnValue(buildQuery(managedProperty()));
    tenant.exists.mockResolvedValue(null);
    property.softDeleteById.mockResolvedValue({ acknowledged: true });
    unit.softDeleteMany.mockResolvedValue({ acknowledged: true });

    const res = await DELETE(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "DELETE",
        token: signToken(CARETAKER_ID),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(200);
  });

  it("403 for caretaker C3 when not assigned to the property", async () => {
    const unassigned = makeProperty({
      _id: PROPERTY_ID,
      ownerId: OTHER_OWNER_ID,
      caretakerIds: [],
    });
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["delete_assigned_property"])));
    property.findById.mockReturnValue(buildQuery(unassigned));
    const res = await DELETE(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "DELETE",
        token: signToken(CARETAKER_ID),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
  });

  it("409 when a tenant references the property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownProperty()));
    tenant.exists.mockResolvedValue({ _id: makeObjectId("t1") });

    const res = await DELETE(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(409);
    expect(property.softDeleteById).not.toHaveBeenCalled();
  });
});
