/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeAnnouncement, makeObjectId, makeTenant, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Announcement", () => ({ Announcement: getModelStubs().announcement }));

import { GET, POST } from "@/app/api/v1/announcements/route";

const { user, property, tenant, announcement } = getModelStubs();

const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const AGENT_ID = makeObjectId("agent");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const OTHER_PROPERTY_ID = makeObjectId("p2");
const ANNOUNCEMENT_ID = makeObjectId("announcement");

function tenantUser() {
  return makeUser({ _id: USER_ID, role: "tenant" });
}

function ownerUser() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerUser(privileges: string[]) {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: privileges as never,
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/announcements", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/announcements"));
    expect(res.status).toBe(401);
  });

  it("scopes tenant reads to their properties plus their own owners' portfolio-wide rows", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID })]),
    );
    announcement.find.mockReturnValue(
      buildQuery([]).sort({ pinned: -1, createdAt: -1 }).skip(0).limit(20),
    );
    announcement.countDocuments.mockResolvedValue(0);
    property.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/announcements", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    expect(announcement.find).toHaveBeenCalledWith({
      $or: [
        { propertyId: { $in: [PROPERTY_ID] } },
        { propertyId: "", ownerId: { $in: [USER_ID] } },
      ],
      audience: { $in: ["all", "tenants"] },
    });
  });

  it("tenant never sees another owner's portfolio-wide announcements", async () => {
    const ownerA = makeObjectId("owner-a");
    const ownerB = makeObjectId("owner-b");
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([
        makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID, ownerId: ownerA }),
      ]),
    );
    announcement.find.mockReturnValue(
      buildQuery([]).sort({ pinned: -1, createdAt: -1 }).skip(0).limit(20),
    );
    announcement.countDocuments.mockResolvedValue(0);
    property.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/announcements", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const filter = announcement.find.mock.calls[0][0] as {
      $or: Array<Record<string, unknown>>;
    };
    // The portfolio-wide branch is pinned to the tenant's OWN owners only.
    expect(filter.$or).toEqual([
      { propertyId: { $in: [PROPERTY_ID] } },
      { propertyId: "", ownerId: { $in: [ownerA] } },
    ]);
    expect(filter.$or[1]).not.toEqual(
      expect.objectContaining({ ownerId: expect.arrayContaining([ownerB]) }),
    );
  });

  it("serializes author and property title", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID })]),
    );
    const row = makeAnnouncement({
      _id: ANNOUNCEMENT_ID,
      authorId: AGENT_ID,
      authorName: "John Kiprono",
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
    });
    announcement.find.mockReturnValue(
      buildQuery([row]).sort({ pinned: -1, createdAt: -1 }).skip(0).limit(20),
    );
    announcement.countDocuments.mockResolvedValue(1);
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));

    const res = await GET(buildRequest("/api/v1/announcements", { token: signToken(USER_ID) }));
    const body = await json(res);
    const data = body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].author).toBe("John Kiprono");
    expect(data[0].property).toBe("Sunlit Studio");
  });

  it("portfolio-wide announcements fall back to All properties", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID })]),
    );
    const row = makeAnnouncement({
      _id: ANNOUNCEMENT_ID,
      authorName: "John Kiprono",
      propertyId: "",
    });
    announcement.find.mockReturnValue(
      buildQuery([row]).sort({ pinned: -1, createdAt: -1 }).skip(0).limit(20),
    );
    announcement.countDocuments.mockResolvedValue(1);

    const res = await GET(buildRequest("/api/v1/announcements", { token: signToken(USER_ID) }));
    const body = await json(res);
    const data = body.data as Array<Record<string, unknown>>;
    expect(data[0].property).toBe("All properties");
  });

  it("owner sees their own announcements", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    announcement.find.mockReturnValue(
      buildQuery([]).sort({ pinned: -1, createdAt: -1 }).skip(0).limit(20),
    );
    announcement.countDocuments.mockResolvedValue(0);
    property.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/announcements", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(announcement.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("caretaker sees only the managed owner's assigned properties", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser(["manage_announcements"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));
    announcement.find.mockReturnValue(
      buildQuery([]).sort({ pinned: -1, createdAt: -1 }).skip(0).limit(20),
    );
    announcement.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/announcements", { token: signToken(CARETAKER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(announcement.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      propertyId: { $in: [PROPERTY_ID] },
    });
  });

  it("tenant with no bound property rows gets an empty page", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: TENANT_ID, propertyId: "", userId: USER_ID })]),
    );

    const res = await GET(buildRequest("/api/v1/announcements", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    expect(announcement.find).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/announcements", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/announcements", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });

  it("403 when a tenant posts", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(buildQuery([]));
    const res = await POST(
      buildRequest("/api/v1/announcements", {
        method: "POST",
        token: signToken(USER_ID),
        body: { title: "Hi", body: "Hello" },
      }),
    );
    expect(res.status).toBe(403);
    expect(announcement.create).not.toHaveBeenCalled();
  });

  it("400 for an invalid payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    const res = await POST(
      buildRequest("/api/v1/announcements", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { title: "", body: "Hello" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("owner creates an announcement for their portfolio", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValueOnce(buildQuery({ _id: OWNER_ID, name: "Test Owner" }));
    const created = makeAnnouncement({
      _id: ANNOUNCEMENT_ID,
      authorId: OWNER_ID,
      authorName: "Test Owner",
      ownerId: OWNER_ID,
      propertyId: "",
      audience: "tenants",
      pinned: false,
    });
    announcement.create.mockResolvedValue(created);
    announcement.findById.mockReturnValue(buildQuery(created));
    property.find.mockReturnValue(buildQuery([]));

    const res = await POST(
      buildRequest("/api/v1/announcements", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { title: "Water works", body: "Tanks cleaned Thursday.", audience: "tenants" },
      }),
    );
    expect(res.status).toBe(201);
    expect(announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        authorId: OWNER_ID,
        authorName: "Test Owner",
        propertyId: "",
        audience: "tenants",
        pinned: false,
      }),
    );
    const body = await json(res);
    expect((body.data as { _id?: string })._id).toBe(ANNOUNCEMENT_ID);
  });

  it("404 when an owner targets a property that does not exist", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValueOnce(buildQuery(ownerUser()));
    property.findById.mockReturnValue(buildQuery(null));

    const res = await POST(
      buildRequest("/api/v1/announcements", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { title: "Water works", body: "Tanks cleaned Thursday.", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(404);
    await expect(json(res)).resolves.toEqual({ error: "Property not found" });
    expect(announcement.create).not.toHaveBeenCalled();
  });

  it("403 when an owner targets another owner's property", async () => {
    const otherOwnerId = makeObjectId("other-owner");
    user.findById
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValueOnce(buildQuery(ownerUser()));
    property.findById.mockReturnValue(buildQuery({ _id: PROPERTY_ID, ownerId: otherOwnerId }));

    const res = await POST(
      buildRequest("/api/v1/announcements", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { title: "Water works", body: "Tanks cleaned Thursday.", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(403);
    await expect(json(res)).resolves.toEqual({ error: "You do not have access to this property" });
    expect(announcement.create).not.toHaveBeenCalled();
  });

  it("assigned caretaker with manage_announcements posts for the managed owner", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(caretakerUser(["manage_announcements"])))
      .mockReturnValueOnce(buildQuery(caretakerUser(["manage_announcements"])))
      .mockReturnValueOnce(buildQuery({ _id: CARETAKER_ID, name: "Caretaker" }));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));
    const created = makeAnnouncement({
      _id: ANNOUNCEMENT_ID,
      authorId: CARETAKER_ID,
      authorName: "Caretaker",
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      pinned: true,
    });
    announcement.create.mockResolvedValue(created);
    announcement.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/announcements", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: {
          title: "Water works",
          body: "Tanks cleaned Thursday.",
          propertyId: PROPERTY_ID,
          pinned: true,
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        authorId: CARETAKER_ID,
        propertyId: PROPERTY_ID,
      }),
    );
  });

  it("403 when a caretaker lacks manage_announcements", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(caretakerUser([])))
      .mockReturnValueOnce(buildQuery(caretakerUser([])));
    property.find.mockReturnValue(buildQuery([]));
    const res = await POST(
      buildRequest("/api/v1/announcements", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: { title: "Water works", body: "Tanks cleaned Thursday." },
      }),
    );
    expect(res.status).toBe(403);
    expect(announcement.create).not.toHaveBeenCalled();
  });

  it("403 when a caretaker pins a property outside their assignment", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(caretakerUser(["manage_announcements"])))
      .mockReturnValueOnce(buildQuery(caretakerUser(["manage_announcements"])))
      .mockReturnValueOnce(buildQuery({ _id: CARETAKER_ID, name: "Caretaker" }));
    property.find.mockReturnValue(buildQuery([{ _id: OTHER_PROPERTY_ID }]));

    const res = await POST(
      buildRequest("/api/v1/announcements", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: { title: "Water works", body: "Tanks cleaned Thursday.", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(403);
    expect(announcement.create).not.toHaveBeenCalled();
  });
});
