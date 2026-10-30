/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/lib/email", () => ({
  sendInviteEmail: vi.fn(),
}));

import { GET, POST } from "@/app/api/v1/caretakers/route";
import { sendInviteEmail } from "@/lib/email";

const { user, property } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const CARE_1 = makeObjectId("care-1");
const CARE_2 = makeObjectId("care-2");

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function adminDoc() {
  return makeUser({ _id: makeObjectId("admin"), role: "system-admin" });
}

function caretakerRow(overrides: Partial<ReturnType<typeof makeUser>> = {}) {
  return makeUser({
    _id: CARE_1,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: ["manage_tenants"],
    ...overrides,
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/caretakers", () => {
  beforeEach(() => {
    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/caretakers"));
    expect(res.status).toBe(401);
  });

  it("401 for an inactive user", async () => {
    user.findById.mockReturnValue(buildQuery({ ...ownerDoc(), isActive: false }));
    const res = await GET(buildRequest("/api/v1/caretakers", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerRow({ _id: makeObjectId("self") })));
    const res = await GET(buildRequest("/api/v1/caretakers", { token: signToken(CARE_1) }));
    expect(res.status).toBe(403);
  });

  it("403 for a tenant", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: makeObjectId("tenant"), role: "tenant" })),
    );
    const res = await GET(
      buildRequest("/api/v1/caretakers", { token: signToken(makeObjectId("tenant")) }),
    );
    expect(res.status).toBe(403);
  });

  it("owner sees only caretakers they manage", async () => {
    const rows = [caretakerRow(), caretakerRow({ _id: CARE_2, name: "Zena W" })];
    const chain = buildQuery(rows);
    user.find.mockReturnValue(chain);
    property.aggregate.mockResolvedValue([{ _id: CARE_1, count: 3 }]);

    const res = await GET(buildRequest("/api/v1/caretakers", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({ role: "caretaker", managedByOwnerId: OWNER_ID });
    expect(chain.select).toHaveBeenCalledWith("name email phone managedByOwnerId privileges");
    expect(property.aggregate).toHaveBeenCalled();
    const data = (await json(res)).data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      id: CARE_1,
      name: "Test Owner",
      managedByOwnerId: OWNER_ID,
      privileges: ["manage_tenants"],
      propertyCount: 3,
    });
    expect(data[1]).toMatchObject({ id: CARE_2, propertyCount: 0 });
  });

  it("owner may pass their own ownerId filter", async () => {
    user.find.mockReturnValue(buildQuery([]));
    property.aggregate.mockResolvedValue([]);
    const res = await GET(
      buildRequest(`/api/v1/caretakers?ownerId=${OWNER_ID}`, { token: signToken(OWNER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({ role: "caretaker", managedByOwnerId: OWNER_ID });
  });

  it("403 when an owner asks for a foreign ownerId filter", async () => {
    const res = await GET(
      buildRequest(`/api/v1/caretakers?ownerId=${OTHER_OWNER_ID}`, { token: signToken(OWNER_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("system-admin sees all caretakers and can filter by any ownerId", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    const rows = [caretakerRow()];
    user.find.mockReturnValue(buildQuery(rows));
    property.aggregate.mockResolvedValue([{ _id: CARE_1, count: 1 }]);

    const res = await GET(
      buildRequest(`/api/v1/caretakers?ownerId=${OWNER_ID}`, { token: signToken(adminDoc()._id) }),
    );
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({ role: "caretaker", managedByOwnerId: OWNER_ID });
  });

  it("skips the propertyCount aggregate when there are no caretakers", async () => {
    user.find.mockReturnValue(buildQuery([]));
    const res = await GET(buildRequest("/api/v1/caretakers", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([]);
    expect(property.aggregate).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/caretakers", () => {
  beforeEach(() => {
    resetModelStubs();
    vi.mocked(sendInviteEmail).mockReset();
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        body: { email: "new@care.co" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerRow()));
    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        token: signToken(CARE_1),
        headers: { "x-forwarded-for": "203.0.113.90" },
        body: { email: "new@care.co" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("409 when the existing user is bound to another owner", async () => {
    const bound = makeUser({
      role: "caretaker",
      managedByOwnerId: OTHER_OWNER_ID,
      isActive: true,
    });
    user.findOne.mockReturnValue(buildQuery(bound));
    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { "x-forwarded-for": "203.0.113.91" },
        body: { email: "bound@care.co", privileges: [] },
      }),
    );
    expect(res.status).toBe(409);
  });

  it("links an existing active user, sets privileges, and returns linked", async () => {
    const existing = makeUser({
      _id: CARE_1,
      role: "caretaker",
      managedByOwnerId: "",
      isActive: true,
      name: "Care One",
      email: "care@care.co",
    }) as ReturnType<typeof makeUser> & { save: ReturnType<typeof vi.fn> };
    user.findOne.mockReturnValue(buildQuery(existing));

    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { "x-forwarded-for": "203.0.113.92" },
        body: { email: "care@care.co", name: "Care One", privileges: ["manage_tenants"] },
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.linked).toBe(true);
    expect(user.updateOne).toHaveBeenCalledWith(
      { _id: CARE_1 },
      {
        $set: {
          managedByOwnerId: OWNER_ID,
          privileges: ["manage_tenants"],
          name: "Care One",
        },
      },
    );
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("creates an inactive unverified caretaker and sends an invite", async () => {
    user.findOne.mockReturnValue(buildQuery(null));
    const created = makeUser({
      _id: CARE_2,
      role: "caretaker",
      name: "New Care",
      email: "new@care.co",
      managedByOwnerId: OWNER_ID,
      isActive: false,
    });
    user.create.mockResolvedValue(created);

    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { "x-forwarded-for": "203.0.113.93" },
        body: { email: "new@care.co", name: "New Care", privileges: ["manage_tenants"] },
      }),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.invited).toBe(true);
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "caretaker",
        email: "new@care.co",
        managedByOwnerId: OWNER_ID,
        isActive: false,
        isVerified: false,
        privileges: ["manage_tenants"],
        verificationToken: expect.any(String),
        verificationTokenExpiry: expect.any(Date),
      }),
    );
    const createArg = user.create.mock.calls[0][0] as {
      passwordHash: string;
      verificationToken: string;
    };
    expect(createArg.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(sendInviteEmail).toHaveBeenCalledWith(
      "new@care.co",
      "New Care",
      "caretaker",
      createArg.verificationToken,
    );
  });

  it("lets a custodian list caretakers under their owner", async () => {
    const custodian = makeUser({
      _id: makeObjectId("custodian"),
      role: "custodian",
      managedByOwnerId: OWNER_ID,
    });
    user.findById.mockReturnValue(buildQuery(custodian));
    user.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/caretakers", { token: signToken(custodian._id) }));
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({ role: "caretaker", managedByOwnerId: OWNER_ID });
  });

  it("lets a custodian invite a caretaker under their owner", async () => {
    const custodian = makeUser({
      _id: makeObjectId("custodian"),
      role: "custodian",
      managedByOwnerId: OWNER_ID,
    });
    user.findById.mockReturnValue(buildQuery(custodian));
    user.findOne.mockReturnValue(buildQuery(null));
    const created = makeUser({
      _id: CARE_2,
      role: "caretaker",
      name: "New Care",
      email: "new@care.co",
      managedByOwnerId: OWNER_ID,
      isActive: false,
    });
    user.create.mockResolvedValue(created);

    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        token: signToken(custodian._id),
        body: { email: "new@care.co", name: "New Care" },
      }),
    );
    expect(res.status).toBe(201);
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({ managedByOwnerId: OWNER_ID, role: "caretaker" }),
    );
  });

  it("creates an active verified phone-only caretaker with a temporary password", async () => {
    user.findOne.mockReturnValue(buildQuery(null));
    const created = {
      _id: CARE_2,
      name: "Phone Care",
      phone: "+254712345678",
      role: "caretaker",
      managedByOwnerId: OWNER_ID,
      privileges: [],
      isActive: true,
      isVerified: true,
    };
    user.create.mockResolvedValue(created);

    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { phone: "0712 345 678", name: "Phone Care" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.created).toBe(true);
    expect(body.password).toEqual(expect.any(String));
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+254712345678",
        role: "caretaker",
        isActive: true,
        isVerified: true,
        managedByOwnerId: OWNER_ID,
      }),
    );
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("refreshes a pending invite and resends the token", async () => {
    const pending = makeUser({
      _id: CARE_1,
      role: "caretaker",
      email: "pending@care.co",
      managedByOwnerId: OWNER_ID,
      isActive: false,
      isVerified: false,
    });
    user.findOne.mockReturnValue(buildQuery(pending));

    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { email: "pending@care.co", name: "Pending Care", privileges: ["manage_tenants"] },
      }),
    );
    expect(res.status).toBe(201);
    expect(user.create).not.toHaveBeenCalled();
    expect(user.updateOne).toHaveBeenCalledWith(
      { _id: CARE_1 },
      {
        $set: expect.objectContaining({
          email: "pending@care.co",
          name: "Pending Care",
          managedByOwnerId: OWNER_ID,
          privileges: ["manage_tenants"],
          verificationToken: expect.any(String),
          verificationTokenExpiry: expect.any(Date),
        }),
      },
    );
    expect(sendInviteEmail).toHaveBeenCalledWith(
      "pending@care.co",
      "Pending Care",
      "caretaker",
      expect.any(String),
    );
  });

  it("409 when the contact belongs to a different role", async () => {
    user.findOne.mockReturnValue(
      buildQuery(makeUser({ role: "tenant", isActive: true, email: "tenant@care.co" })),
    );

    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { email: "tenant@care.co" },
      }),
    );
    expect(res.status).toBe(409);
  });

  it("system-admin requires an active ownerId", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    const res = await POST(
      buildRequest("/api/v1/caretakers", {
        method: "POST",
        token: signToken(adminDoc()._id),
        body: { email: "new@care.co" },
      }),
    );
    expect(res.status).toBe(400);
    expect(user.create).not.toHaveBeenCalled();
  });
});
