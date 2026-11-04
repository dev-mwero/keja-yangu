/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeTenant, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({
  Tenant: getModelStubs().tenant,
  TENANT_SAFE_FIELDS:
    "name email phone propertyId ownerId status joinedAt notes createdAt updatedAt",
}));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/MoveRequest", () => ({ MoveRequest: getModelStubs().moverrequest }));
vi.mock("@/lib/email", () => ({
  sendInviteEmail: vi.fn(),
}));

import { GET, POST } from "@/app/api/v1/tenants/route";
import { sendInviteEmail } from "@/lib/email";

const {
  user,
  property,
  tenant: tenantStub,
  unit: unitStub,
  moverrequest: moveRequestStub,
} = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const ADMIN_ID = makeObjectId("admin");
const PROPERTY_ID = makeObjectId("p1");
const TENANT_ID = makeObjectId("t1");

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function adminDoc() {
  return makeUser({ _id: ADMIN_ID, role: "system-admin" });
}

function caretakerDoc(privileges: string[]) {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: privileges as ReturnType<typeof makeUser>["privileges"],
  });
}

function ownedProperty() {
  return makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] });
}

const tenantInput = {
  name: "Amina Otieno",
  email: "amina@keja.co",
  propertyId: PROPERTY_ID,
};

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/tenants", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/tenants"));
    expect(res.status).toBe(401);
  });

  it("403 for a default caretaker (C0)", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc([])));
    const res = await GET(buildRequest("/api/v1/tenants", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(403);
  });

  it("owner sees only their own tenants", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const rows = [makeTenant({ _id: TENANT_ID, ownerId: OWNER_ID })];
    const chain = buildQuery(rows);
    tenantStub.find.mockReturnValue(chain);
    tenantStub.countDocuments.mockResolvedValue(1);
    moveRequestStub.find.mockReturnValue(buildQuery([]));
    unitStub.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/tenants", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(tenantStub.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(tenantStub.countDocuments).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(chain.select).toHaveBeenCalledWith(
      "name email phone propertyId ownerId status joinedAt notes createdAt updatedAt userId",
    );
    const body = await json(res);
    expect((body.data as Array<{ ownerId: string }>)[0].ownerId).toBe(OWNER_ID);
  });

  it("attaches requestedUnit from a pending move-in request", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const userId = makeObjectId("u1");
    const rows = [makeTenant({ _id: TENANT_ID, ownerId: OWNER_ID, userId })];
    tenantStub.find.mockReturnValue(buildQuery(rows));
    tenantStub.countDocuments.mockResolvedValue(1);
    const unitId = makeObjectId("unit-a");
    moveRequestStub.find.mockReturnValue(
      buildQuery([{ tenantId: TENANT_ID, type: "move-in", status: "pending", unitId }]),
    );
    unitStub.find.mockReturnValue(
      buildQuery([{ _id: unitId, name: "3A", blockName: "Block A", tenantId: "" }]),
    );

    const res = await GET(buildRequest("/api/v1/tenants", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    const row = (body.data as Array<{ requestedUnit?: { _id: string; name: string } }>)[0];
    expect(row.requestedUnit).toMatchObject({
      _id: unitId,
      name: "3A",
      blockName: "Block A",
    });
  });

  it("403 when an owner requests a foreign ownerId filter", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await GET(
      buildRequest(`/api/v1/tenants?ownerId=${makeObjectId("other")}`, {
        token: signToken(OWNER_ID),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("owner may pass their own ownerId filter", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    tenantStub.find.mockReturnValue(buildQuery([]));
    tenantStub.countDocuments.mockResolvedValue(0);
    const res = await GET(
      buildRequest(`/api/v1/tenants?ownerId=${OWNER_ID}&status=active&propertyId=${PROPERTY_ID}`, {
        token: signToken(OWNER_ID),
      }),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      status: "active",
      propertyId: PROPERTY_ID,
    });
  });

  it("system-admin sees all tenants and may filter by any ownerId", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    tenantStub.find.mockReturnValue(buildQuery([]));
    tenantStub.countDocuments.mockResolvedValue(0);
    const res = await GET(
      buildRequest(`/api/v1/tenants?ownerId=${OWNER_ID}`, { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("caretaker C4 sees only assigned properties of the managing owner", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["manage_tenants"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    tenantStub.find.mockReturnValue(buildQuery([]));
    tenantStub.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/tenants", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    expect(tenantStub.find).toHaveBeenCalledWith({
      propertyId: { $in: [PROPERTY_ID] },
      ownerId: OWNER_ID,
    });
  });
});

describe("POST /api/v1/tenants", () => {
  beforeEach(() => {
    resetModelStubs();
    vi.mocked(sendInviteEmail).mockReset();
    user.findOne.mockReturnValue(buildQuery(null));
  });

  it("403 when the Origin header does not match the app origin", async () => {
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { origin: "https://evil.example" },
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/tenants", { method: "POST", body: tenantInput }));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker without manage_tenants", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc([])));
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("owner creates a tenant on their own property with ownerId from the property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({
      _id: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      status: "pending",
    });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.data as { ownerId?: string }).ownerId).toBe(OWNER_ID);
    expect(tenantStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        status: "pending",
        joinedAt: undefined,
      }),
    );
  });

  it("owner create passes through an explicit active status and sets joinedAt", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({ _id: TENANT_ID, status: "active" });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { ...tenantInput, status: "active" },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = tenantStub.create.mock.calls[0][0] as { status?: string; joinedAt?: Date };
    expect(createArgs.status).toBe("active");
    expect(createArgs.joinedAt).toBeInstanceOf(Date);
  });

  it("403 when an owner targets a foreign property", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: makeObjectId("other") })),
    );
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(403);
    expect(tenantStub.create).not.toHaveBeenCalled();
  });

  it("422 when the property does not exist", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(422);
  });

  it("system-admin can create on any property", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({ _id: TENANT_ID, status: "rejected" });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { ...tenantInput, status: "rejected" },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = tenantStub.create.mock.calls[0][0] as { status?: string };
    expect(createArgs.status).toBe("rejected");
  });

  it("caretaker C4 can create on an assigned property and status is forced to pending", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["manage_tenants"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({ _id: TENANT_ID, status: "pending" });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: { ...tenantInput, status: "active" },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = tenantStub.create.mock.calls[0][0] as { status?: string };
    expect(createArgs.status).toBe("pending");
  });

  it("403 for caretaker C4 on an unassigned property", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["manage_tenants"])));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [] })),
    );
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("409 when a duplicate { propertyId, email } already exists", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("existing") }));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(409);
    expect(tenantStub.findOne).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      email: tenantInput.email,
    });
    expect(tenantStub.create).not.toHaveBeenCalled();
  });

  it("400 when propertyId is not a 24-hex ObjectId", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { ...tenantInput, propertyId: "short" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(null)); // 422 path — cheap, no create
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        buildRequest("/api/v1/tenants", {
          method: "POST",
          token: signToken(OWNER_ID),
          headers: { "x-forwarded-for": "203.0.113.77" },
          body: tenantInput,
        }),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("links the tenant to an existing verified active user and sends no invite", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const existingUserId = makeObjectId("existing-user");
    user.findOne.mockReturnValue(buildQuery({ _id: existingUserId }));
    const created = makeTenant({
      _id: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      status: "pending",
      userId: existingUserId,
    });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { "x-forwarded-for": "203.0.113.80" },
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(201);
    expect(user.findOne).toHaveBeenCalledWith({ email: tenantInput.email });
    expect(tenantStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: existingUserId }),
    );
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("creates with userId empty and sends an invite when no verified user exists", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    user.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({
      _id: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      status: "pending",
      userId: "",
    });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));
    vi.mocked(sendInviteEmail).mockResolvedValue(true);

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { "x-forwarded-for": "203.0.113.81" },
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(201);
    expect(tenantStub.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "" }));
    expect(sendInviteEmail).toHaveBeenCalledWith(
      tenantInput.email,
      tenantInput.name,
      "tenant",
      expect.any(String),
    );
  });

  it("creates a phone-only tenant with an active verified user bound immediately", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    user.findOne.mockReturnValue(buildQuery(null));
    const phoneUser = {
      _id: makeObjectId("user"),
      name: "Amina Phone",
      email: undefined,
      phone: "+254712345678",
      role: "tenant",
      isActive: true,
      isVerified: true,
    };
    user.create.mockResolvedValue(phoneUser);
    const createdTenant = makeTenant({
      _id: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      status: "active",
      joinedAt: expect.any(Date),
      userId: String(makeObjectId("user")),
    });
    tenantStub.create.mockResolvedValue(createdTenant);
    tenantStub.findById.mockReturnValue(buildQuery(createdTenant));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { "x-forwarded-for": "203.0.113.81" },
        body: { name: "Amina Phone", phone: "+254712345678", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.created).toBe(true);
    expect(body.password).toBeDefined();
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+254712345678",
        role: "tenant",
        isActive: true,
        isVerified: true,
        email: undefined,
      }),
    );
    // Tenant row bound immediately (no verify-email step needed)
    expect(tenantStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: phoneUser._id }),
    );
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("accepts both email and phone and stores a normalised phone", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    user.findOne.mockReturnValue(buildQuery(null));
    const created = makeTenant({ _id: TENANT_ID, status: "pending" });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));
    vi.mocked(sendInviteEmail).mockResolvedValue(true);

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { "x-forwarded-for": "203.0.113.84" },
        body: { ...tenantInput, phone: "0712 345 678" },
      }),
    );
    expect(res.status).toBe(201);
    expect(tenantStub.findOne).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      $or: [{ email: tenantInput.email }, { phone: "+254712345678" }],
    });
    expect(tenantStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: tenantInput.email, phone: "+254712345678" }),
    );
    expect(sendInviteEmail).toHaveBeenCalled();
  });

  it("400 when a supplied phone is invalid", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "Amina Phone", phone: "not-a-phone", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(400);
    expect(tenantStub.create).not.toHaveBeenCalled();
  });

  it("409 when the contact belongs to an account with a different role", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    user.findOne.mockReturnValue(
      buildQuery({ _id: makeObjectId("owner-account"), role: "owner", isActive: true }),
    );

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(409);
    expect(tenantStub.create).not.toHaveBeenCalled();
  });

  it("409 when another tenant on the property already uses the phone", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("existing") }));
    user.findOne.mockReturnValue(buildQuery(null));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "Amina Phone", phone: "0712345678", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(409);
    expect(tenantStub.findOne).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      phone: "+254712345678",
    });
  });

  it("normalises a local phone before creating a phone-only account", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    user.findOne.mockReturnValue(buildQuery(null));
    const phoneUser = {
      _id: makeObjectId("user"),
      name: "Amina Phone",
      phone: "+254712345678",
      role: "tenant",
      isActive: true,
      isVerified: true,
    };
    user.create.mockResolvedValue(phoneUser);
    const createdTenant = makeTenant({ _id: TENANT_ID, status: "active" });
    tenantStub.create.mockResolvedValue(createdTenant);
    tenantStub.findById.mockReturnValue(buildQuery(createdTenant));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "Amina Phone", phone: "0712 345 678", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(201);
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "+254712345678", isActive: true, isVerified: true }),
    );
  });

  it("links an existing phone-only tenant instead of creating another account", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    const existingUserId = makeObjectId("phone-user");
    user.findOne.mockReturnValue(
      buildQuery({
        _id: existingUserId,
        phone: "+254712345678",
        role: "tenant",
        isActive: true,
        isVerified: true,
      }),
    );
    const created = makeTenant({ _id: TENANT_ID, status: "active" });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { name: "Amina Phone", phone: "+254712345678", propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.password).toBeUndefined();
    expect(user.create).not.toHaveBeenCalled();
    expect(tenantStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: existingUserId }),
    );
  });

  it("refreshes and resends a pending email invite instead of duplicating the user", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    tenantStub.findOne.mockReturnValue(buildQuery(null));
    user.findOne.mockReturnValue(
      buildQuery({
        _id: makeObjectId("pending-user"),
        email: tenantInput.email,
        role: "tenant",
        isActive: false,
        isVerified: false,
      }),
    );
    const created = makeTenant({ _id: TENANT_ID, status: "pending" });
    tenantStub.create.mockResolvedValue(created);
    tenantStub.findById.mockReturnValue(buildQuery(created));
    vi.mocked(sendInviteEmail).mockResolvedValue(true);

    const res = await POST(
      buildRequest("/api/v1/tenants", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: tenantInput,
      }),
    );
    expect(res.status).toBe(201);
    expect(user.create).not.toHaveBeenCalled();
    expect(user.updateOne).toHaveBeenCalled();
    expect(sendInviteEmail).toHaveBeenCalledWith(
      tenantInput.email,
      tenantInput.name,
      "tenant",
      expect.any(String),
    );
    expect(tenantStub.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "" }));
  });
});
