/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));

import { GET, POST } from "@/app/api/v1/properties/route";

const { user, property } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const OTHER_OWNER_ID = makeObjectId("other-owner");

const validPropertyBody = {
  title: "Sunset Villa",
  location: "Kilimani, Nairobi",
  price: 45000,
  beds: 2,
  baths: 1,
};

const validCreatedProperty = makeProperty({
  _id: makeObjectId("p1"),
  ownerId: OWNER_ID,
  createdById: OWNER_ID,
});

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/properties", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns only available properties with the public projection when anonymous", async () => {
    const publicDocs = [
      makeProperty({ _id: makeObjectId("p1"), title: "One" }),
      makeProperty({ _id: makeObjectId("p2"), title: "Two" }),
    ];
    // Public projection means identity fields are dropped server-side.
    const chain = buildQuery(
      publicDocs.map((d) => ({
        ...d,
        ownerId: undefined,
        caretakerIds: undefined,
        createdById: undefined,
      })),
    );
    property.find.mockReturnValue(chain);
    property.countDocuments.mockResolvedValue(2);

    const res = await GET(buildRequest("/api/v1/properties"));
    expect(res.status).toBe(200);
    const body = await json(res);

    expect(property.find).toHaveBeenCalledWith({ status: "available" });
    expect(property.countDocuments).toHaveBeenCalledWith({ status: "available" });
    expect(chain.select).toHaveBeenCalledWith("-ownerId -caretakerIds -createdById -__v");
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(10);

    expect(body.data).toHaveLength(2);
    expect(body.pagination).toMatchObject({ page: 1, limit: 10, total: 2, totalPages: 1 });
    for (const item of body.data as Array<Record<string, unknown>>) {
      expect(item.ownerId).toBeUndefined();
      expect(item.caretakerIds).toBeUndefined();
      expect(item.createdById).toBeUndefined();
    }
    // anonymous requests ignore identity query filters entirely
    property.find.mockClear();
    await GET(buildRequest("/api/v1/properties?ownerId=someone"));
    expect(property.find).toHaveBeenCalledWith({ status: "available" });
  });

  it("returns all properties for an authenticated owner with no filters", async () => {
    const ownerDoc = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(ownerDoc));
    const owned = [makeProperty({ _id: makeObjectId("p1") })];
    property.find.mockReturnValue(buildQuery(owned));
    property.countDocuments.mockResolvedValue(1);

    const res = await GET(buildRequest("/api/v1/properties", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(property.find).toHaveBeenCalledWith({});
    expect(body.data).toHaveLength(1);
  });

  it("applies ownerId and status filters for authenticated requests", async () => {
    const ownerDoc = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(ownerDoc));
    property.find.mockReturnValue(buildQuery([]));
    property.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/properties?status=available&ownerId=abc123", {
        token: signToken(OWNER_ID),
      }),
    );
    expect(res.status).toBe(200);
    expect(property.find).toHaveBeenCalledWith({ status: "available", ownerId: "abc123" });
  });

  it("applies caretakerId filter via the caretakerIds multikey", async () => {
    const ownerDoc = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(ownerDoc));
    property.find.mockReturnValue(buildQuery([]));
    property.countDocuments.mockResolvedValue(0);

    await GET(buildRequest("/api/v1/properties?caretakerId=c1", { token: signToken(OWNER_ID) }));
    expect(property.find).toHaveBeenCalledWith({ caretakerIds: "c1" });
  });
});

describe("POST /api/v1/properties", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("/api/v1/properties", { method: "POST", body: validPropertyBody }),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker without create_property (C0)", async () => {
    const caretaker = makeUser({
      _id: CARETAKER_ID,
      role: "caretaker",
      managedByOwnerId: OTHER_OWNER_ID,
      privileges: [],
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    const res = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        body: validPropertyBody,
        token: signToken(CARETAKER_ID),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("403 for caretaker profiles C2/C3/C4", async () => {
    const privilegeProfiles = [
      ["edit_property"],
      ["delete_assigned_property"],
      ["manage_tenants"],
    ] as const;
    for (const privileges of privilegeProfiles) {
      const caretaker = makeUser({
        _id: CARETAKER_ID,
        role: "caretaker",
        managedByOwnerId: OTHER_OWNER_ID,
        privileges: [...privileges],
      });
      user.findById.mockReturnValue(buildQuery(caretaker));
      const res = await POST(
        buildRequest("/api/v1/properties", {
          method: "POST",
          body: validPropertyBody,
          token: signToken(CARETAKER_ID),
        }),
      );
      expect(res.status, `expected 403 for privileges ${privileges.join(",")}`).toBe(403);
    }
  });

  it("403 for an orphaned caretaker", async () => {
    const caretaker = makeUser({
      _id: CARETAKER_ID,
      role: "caretaker",
      managedByOwnerId: "",
      privileges: ["create_property"],
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    const res = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        body: validPropertyBody,
        token: signToken(CARETAKER_ID),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a tenant actor", async () => {
    const tenant = makeUser({ _id: makeObjectId("tenant"), role: "tenant" });
    user.findById.mockReturnValue(buildQuery(tenant));
    const res = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        body: validPropertyBody,
        token: signToken(tenant._id),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("owner create attributes ownerId and createdById to the actor", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(owner));
    property.create.mockResolvedValue(validCreatedProperty);

    const res = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        body: validPropertyBody,
        token: signToken(OWNER_ID),
      }),
    );
    expect(res.status).toBe(201);
    expect(property.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: OWNER_ID, createdById: OWNER_ID, caretakerIds: [] }),
    );
    const body = await json(res);
    expect((body.data as { title?: string }).title).toBe("Sunset Villa");
  });

  it("owner create ignores a spoofed ownerId in the body", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(owner));
    property.create.mockResolvedValue(validCreatedProperty);

    const spoofed = makeObjectId("spoof");
    const caretakerLookup = makeUser({ _id: CARETAKER_ID, role: "caretaker" });
    user.find.mockReturnValue(buildQuery([caretakerLookup]));

    const res = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { ...validPropertyBody, ownerId: spoofed, caretakerIds: [CARETAKER_ID] },
      }),
    );
    expect(res.status).toBe(201);
    expect(property.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: OWNER_ID, createdById: OWNER_ID }),
    );
    const createArgs = property.create.mock.calls[0][0] as { ownerId: string };
    expect(createArgs.ownerId).not.toBe(spoofed);
  });

  it("owner create validates caretakerIds reference caretaker users", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(owner));
    // Requested two caretakers but only one exists as a caretaker user.
    user.find.mockReturnValue(buildQuery([makeUser({ _id: CARETAKER_ID, role: "caretaker" })]));

    const res = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { ...validPropertyBody, caretakerIds: [CARETAKER_ID, makeObjectId("ghost")] },
      }),
    );
    expect(res.status).toBe(400);
    expect(property.create).not.toHaveBeenCalled();
  });

  it("caretaker C1 create attributes ownerId to the managing owner and self-appends to caretakerIds", async () => {
    const caretaker = makeUser({
      _id: CARETAKER_ID,
      role: "caretaker",
      managedByOwnerId: OTHER_OWNER_ID,
      privileges: ["create_property"],
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    user.findOne.mockReturnValue(
      buildQuery({ _id: OTHER_OWNER_ID, role: "owner", isActive: true }),
    );
    // the creator is auto-appended to caretakerIds, so the caretaker-id
    // validation lookup sees the actor's own doc
    user.find.mockReturnValue(buildQuery([{ _id: CARETAKER_ID, role: "caretaker" }]));
    property.create.mockResolvedValue(
      makeProperty({
        _id: makeObjectId("p1"),
        ownerId: OTHER_OWNER_ID,
        caretakerIds: [CARETAKER_ID],
      }),
    );

    const res = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: validPropertyBody,
      }),
    );
    expect(res.status).toBe(201);
    expect(user.findOne).toHaveBeenCalledWith({
      _id: OTHER_OWNER_ID,
      role: "owner",
      isActive: true,
    });
    expect(property.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OTHER_OWNER_ID,
        createdById: CARETAKER_ID,
        caretakerIds: [CARETAKER_ID],
      }),
    );
  });

  it("caretaker C1 create fails closed when the managing owner is missing", async () => {
    const caretaker = makeUser({
      _id: CARETAKER_ID,
      role: "caretaker",
      managedByOwnerId: OTHER_OWNER_ID,
      privileges: ["create_property"],
    });
    user.findById.mockReturnValue(buildQuery(caretaker));
    user.findOne.mockReturnValue(buildQuery(null));

    const res = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: validPropertyBody,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("system-admin create requires an active owner target", async () => {
    const admin = makeUser({ _id: makeObjectId("admin"), role: "system-admin" });
    user.findById.mockReturnValue(buildQuery(admin));

    const missing = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        token: signToken(admin._id),
        body: validPropertyBody,
      }),
    );
    expect(missing.status).toBe(400);

    user.findOne.mockReturnValue(buildQuery({ _id: OWNER_ID, role: "owner", isActive: true }));
    property.create.mockResolvedValue(validCreatedProperty);

    const ok = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        token: signToken(admin._id),
        body: { ...validPropertyBody, targetOwnerId: OWNER_ID },
      }),
    );
    expect(ok.status).toBe(201);
    expect(property.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: OWNER_ID, createdById: admin._id }),
    );
  });

  it("returns 400 for an invalid payload", async () => {
    const owner = makeUser({ _id: OWNER_ID, role: "owner" });
    user.findById.mockReturnValue(buildQuery(owner));
    const res = await POST(
      buildRequest("/api/v1/properties", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { title: "   ", price: -5 },
      }),
    );
    expect(res.status).toBe(400);
    expect(property.create).not.toHaveBeenCalled();
  });
});
